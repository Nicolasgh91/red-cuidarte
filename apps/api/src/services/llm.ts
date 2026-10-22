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

/** Groq respondió 429 (límite del free tier). */
export class LlmRateLimitError extends Error {}
export class LlmError extends Error {}

export function createGroqClient(apiKey: string, model: string, timeoutMs = 60_000): LlmClient {
  return {
    async complete({ messages, tools }) {
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
        }),
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (res.status === 429) throw new LlmRateLimitError("Groq: límite alcanzado");
      if (!res.ok) throw new LlmError(`Groq respondió ${res.status}`);
      const body = (await res.json()) as {
        choices: { message: { content: string | null; tool_calls?: ToolCall[] } }[];
      };
      const msg = body.choices[0]?.message;
      if (!msg) throw new LlmError("Groq devolvió una respuesta vacía");
      return { content: msg.content, tool_calls: msg.tool_calls ?? [] };
    },
  };
}
