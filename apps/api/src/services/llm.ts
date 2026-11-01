// Cliente del LLM del asistente. Groq expone una API compatible con OpenAI.

export interface ToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

export type ChatMessage =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: ToolCall[] }
  | { role: "tool"; tool_call_id: string; content: string };

export interface ToolDef {
  type: "function";
  function: { name: string; description: string; parameters: Record<string, unknown> };
}

export interface LlmResult {
  content: string | null;
  tool_calls: ToolCall[];
}

export interface LlmClient {
  complete(input: { messages: ChatMessage[]; tools: ToolDef[] }): Promise<LlmResult>;
}

/**
 * Groq falló. `status` es el HTTP de Groq (sin status: error de red), `code` el `error.code` de su
 * cuerpo y `retryAfter` los segundos del header retry-after.
 */
export class LlmError extends Error {
  constructor(
    message: string,
    public status?: number,
    public code?: string,
    public retryAfter?: number,
  ) {
    super(message);
  }
}

/** Esperas más largas que esto no entran en el pedido: se responde «ocupado». */
const MAX_RETRY_WAIT_S = 8;

const sleepMs = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

async function toLlmError(res: Response): Promise<LlmError> {
  const text = (await res.text().catch(() => "")).slice(0, 300);
  let detail: { message?: string; code?: string } = {};
  try {
    detail = (JSON.parse(text) as { error?: typeof detail }).error ?? {};
  } catch {
    // cuerpo no JSON: queda el texto crudo en el mensaje
  }
  const retryAfter = Number(res.headers.get("retry-after"));
  return new LlmError(
    `Groq respondió ${res.status}: ${detail.message ?? text}`,
    res.status,
    detail.code,
    Number.isFinite(retryAfter) && retryAfter >= 0 ? retryAfter : undefined,
  );
}

/** Segundos a esperar antes del único reintento, o null si el error no es transitorio. */
function retryDelay(e: LlmError): number | null {
  if (e.status === 429)
    return e.retryAfter !== undefined && e.retryAfter <= MAX_RETRY_WAIT_S ? e.retryAfter : null;
  if (e.status !== undefined && e.status >= 500) return 1;
  // gpt-oss a veces arma mal la llamada a la herramienta; otra pasada suele salir bien.
  if (e.status === 400 && e.code === "tool_use_failed") return 0;
  return null;
}

export function createGroqClient(
  apiKey: string,
  model: string,
  timeoutMs = 60_000,
  sleep = sleepMs,
): LlmClient {
  const send = async (messages: ChatMessage[], tools: ToolDef[]): Promise<LlmResult> => {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages,
        tools,
        tool_choice: "auto",
        temperature: 0.3,
        max_tokens: 800,
        // Menos razonamiento: menos tokens por minuto (límite del free tier) y no se come max_tokens.
        ...(model.startsWith("openai/gpt-oss") && { reasoning_effort: "low" }),
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) throw await toLlmError(res);
    const body = (await res.json()) as {
      choices: { message: { content: string | null; tool_calls?: ToolCall[] } }[];
    };
    const msg = body.choices[0]?.message;
    if (!msg) throw new LlmError("Groq devolvió una respuesta vacía");
    return { content: msg.content, tool_calls: msg.tool_calls ?? [] };
  };

  return {
    async complete({ messages, tools }) {
      try {
        return await send(messages, tools);
      } catch (e) {
        const wait = e instanceof LlmError ? retryDelay(e) : null;
        if (wait === null) throw e;
        await sleep(wait * 1000);
        return send(messages, tools);
      }
    },
  };
}
