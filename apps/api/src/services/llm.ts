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

/**
 * Consumo de una llamada. `limits` son los headers `x-ratelimit-*` tal como llegan: en Groq,
 * `*-requests` es el cupo de pedidos **por día** (RPD) y `*-tokens` el de tokens **por minuto** (TPM).
 */
export interface LlmUsage {
  prompt: number;
  cached: number;
  completion: number;
  ms: number;
  finish?: string;
  limits: Record<string, string>;
}

export interface LlmResult {
  content: string | null;
  tool_calls: ToolCall[];
  usage?: LlmUsage;
}

export interface LlmClient {
  /** `deadline`: instante (ms desde 1970) en que hay que dejar de esperar a Groq. */
  complete(input: {
    messages: ChatMessage[];
    tools: ToolDef[];
    deadline?: number;
  }): Promise<LlmResult>;
}

export type RateLimit = "TPM" | "TPD" | "RPM" | "RPD" | "ITPM" | "OTPM";

/**
 * Groq falló. `status` es el HTTP de Groq (sin status: error de red), `code` el `error.code` de su
 * cuerpo, `retryAfter` los segundos del header retry-after y `limit` qué tope se alcanzó (429).
 */
export class LlmError extends Error {
  constructor(
    message: string,
    public status?: number,
    public code?: string,
    public retryAfter?: number,
    public limit?: RateLimit,
  ) {
    super(message);
  }
}

/** Esperas más largas que esto no entran en el pedido: se responde «ocupado». */
const MAX_RETRY_WAIT_S = 8;

const sleepMs = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export const timeoutError = () =>
  Object.assign(new Error("Se terminó el tiempo para responder"), { name: "TimeoutError" });

async function toLlmError(res: Response): Promise<LlmError> {
  const text = (await res.text().catch(() => "")).slice(0, 300);
  let detail: { message?: string; code?: string } = {};
  try {
    detail = (JSON.parse(text) as { error?: typeof detail }).error ?? {};
  } catch {
    // cuerpo no JSON: queda el texto crudo en el mensaje
  }
  const retryAfter = Number(res.headers.get("retry-after"));
  const message = detail.message ?? text;
  // «… on tokens per minute (TPM): Limit 8000, Used …»
  const limit = /\((TPM|TPD|RPM|RPD|ITPM|OTPM)\)/.exec(message)?.[1] as RateLimit | undefined;
  return new LlmError(
    `Groq respondió ${res.status}: ${message}`,
    res.status,
    detail.code,
    Number.isFinite(retryAfter) && retryAfter >= 0 ? retryAfter : undefined,
    limit,
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

const rateLimitHeaders = (h: Headers): Record<string, string> => {
  const out: Record<string, string> = {};
  h.forEach((v, k) => {
    if (k.startsWith("x-ratelimit-")) out[k.slice("x-ratelimit-".length)] = v;
  });
  return out;
};

export function createGroqClient(
  apiKey: string,
  model: string,
  timeoutMs = 60_000,
  sleep = sleepMs,
): LlmClient {
  const send = async (
    messages: ChatMessage[],
    tools: ToolDef[],
    deadline: number,
  ): Promise<LlmResult> => {
    const wait = Math.min(timeoutMs, deadline - Date.now());
    if (wait <= 0) throw timeoutError();
    const started = Date.now();
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages,
        tools,
        tool_choice: "auto",
        temperature: 0.3,
        max_completion_tokens: 800,
        // Menos razonamiento: menos tokens por minuto (límite del free tier) y no se come la salida.
        ...(model.startsWith("openai/gpt-oss") && { reasoning_effort: "low" }),
      }),
      signal: AbortSignal.timeout(wait),
    });
    if (!res.ok) throw await toLlmError(res);
    const body = (await res.json()) as {
      choices: {
        message: { content: string | null; tool_calls?: ToolCall[] };
        finish_reason?: string;
      }[];
      usage?: {
        prompt_tokens?: number;
        completion_tokens?: number;
        prompt_tokens_details?: { cached_tokens?: number } | null;
      };
    };
    const choice = body.choices[0];
    if (!choice?.message) throw new LlmError("Groq devolvió una respuesta vacía");
    return {
      content: choice.message.content,
      tool_calls: choice.message.tool_calls ?? [],
      usage: {
        prompt: body.usage?.prompt_tokens ?? 0,
        cached: body.usage?.prompt_tokens_details?.cached_tokens ?? 0,
        completion: body.usage?.completion_tokens ?? 0,
        ms: Date.now() - started,
        finish: choice.finish_reason,
        limits: rateLimitHeaders(res.headers),
      },
    };
  };

  return {
    async complete({ messages, tools, deadline = Infinity }) {
      try {
        return await send(messages, tools, deadline);
      } catch (e) {
        const wait = e instanceof LlmError ? retryDelay(e) : null;
        // El reintento tiene que entrar en el plazo, con 1 s de margen para la respuesta.
        if (wait === null || Date.now() + wait * 1000 + 1000 > deadline) throw e;
        await sleep(wait * 1000);
        return send(messages, tools, deadline);
      }
    },
  };
}
