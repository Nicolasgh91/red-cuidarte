import { afterEach, describe, expect, it, vi } from "vitest";
import { createGroqClient, LlmError } from "../src/services/llm.js";

const ok = () =>
  new Response(JSON.stringify({ choices: [{ message: { content: "Hola." } }] }), { status: 200 });
const fail = (status: number, code?: string, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify({ error: { message: "algo pasó", code } }), { status, headers });

const input = { messages: [{ role: "user" as const, content: "hola" }], tools: [] };

function setup(responses: Response[], model = "openai/gpt-oss-120b") {
  const fetchMock = vi.fn(async () => responses.shift()!);
  vi.stubGlobal("fetch", fetchMock);
  const sleep = vi.fn(async () => {});
  return { fetchMock, sleep, client: createGroqClient("k", model, 1000, sleep) };
}

const body = (m: ReturnType<typeof setup>["fetchMock"]) =>
  JSON.parse((m.mock.calls[0] as unknown as [string, RequestInit])[1].body as string) as Record<
    string,
    unknown
  >;

afterEach(() => void vi.unstubAllGlobals());

describe("cliente de Groq", () => {
  it("429 con retry-after corto: espera y reintenta una vez", async () => {
    const { fetchMock, sleep, client } = setup([
      fail(429, "rate_limit_exceeded", { "retry-after": "2" }),
      ok(),
    ]);
    expect(await client.complete(input)).toMatchObject({ content: "Hola.", tool_calls: [] });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(2000);
  });

  it("429 con retry-after largo: no espera, sale con el status", async () => {
    const { fetchMock, client } = setup([
      fail(429, "rate_limit_exceeded", { "retry-after": "40" }),
    ]);
    await expect(client.complete(input)).rejects.toMatchObject({ status: 429, retryAfter: 40 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("400 tool_use_failed: reintenta", async () => {
    const { fetchMock, client } = setup([fail(400, "tool_use_failed"), ok()]);
    expect((await client.complete(input)).content).toBe("Hola.");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("401: no reintenta y expone status, code y el mensaje de Groq", async () => {
    const { fetchMock, client } = setup([fail(401, "invalid_api_key")]);
    const e = await client.complete(input).catch((x: unknown) => x);
    expect(e).toBeInstanceOf(LlmError);
    expect(e).toMatchObject({ status: 401, code: "invalid_api_key" });
    expect((e as Error).message).toContain("algo pasó");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("pide razonamiento bajo solo a los modelos gpt-oss, y la salida con max_completion_tokens", async () => {
    const a = setup([ok()]);
    await a.client.complete(input);
    expect(body(a.fetchMock).reasoning_effort).toBe("low");
    expect(body(a.fetchMock).max_completion_tokens).toBe(800);
    expect(body(a.fetchMock)).not.toHaveProperty("max_tokens");
    const b = setup([ok()], "llama-3.3-70b-versatile");
    await b.client.complete(input);
    expect(body(b.fetchMock)).not.toHaveProperty("reasoning_effort");
  });

  it("lee el consumo, el motivo de fin y los headers x-ratelimit-*", async () => {
    const { client } = setup([
      new Response(
        JSON.stringify({
          choices: [{ message: { content: "Hola." }, finish_reason: "stop" }],
          usage: {
            prompt_tokens: 2000,
            completion_tokens: 50,
            prompt_tokens_details: { cached_tokens: 1500 },
          },
        }),
        {
          status: 200,
          headers: {
            "x-ratelimit-remaining-requests": "990",
            "x-ratelimit-remaining-tokens": "5950",
            "x-other": "no",
          },
        },
      ),
    ]);
    const { usage } = await client.complete(input);
    expect(usage).toMatchObject({
      prompt: 2000,
      cached: 1500,
      completion: 50,
      finish: "stop",
      limits: { "remaining-requests": "990", "remaining-tokens": "5950" },
    });
    expect(Object.keys(usage!.limits)).toHaveLength(2);
  });

  it.each([
    ["tokens per minute (TPM)", "TPM"],
    ["tokens per day (TPD)", "TPD"],
    ["requests per day (RPD)", "RPD"],
    ["requests per minute (RPM)", "RPM"],
  ])("429 por %s: queda el tipo de límite", async (what, limit) => {
    const { client } = setup([
      new Response(
        JSON.stringify({
          error: {
            message: `Rate limit reached for model \`openai/gpt-oss-120b\` on ${what}: Limit 8000`,
            code: "rate_limit_exceeded",
          },
        }),
        { status: 429, headers: { "retry-after": "40" } },
      ),
    ]);
    await expect(client.complete(input)).rejects.toMatchObject({ status: 429, limit });
  });

  it("respeta el plazo: no llama si ya venció y no reintenta si la espera no entra", async () => {
    const a = setup([]);
    await expect(a.client.complete({ ...input, deadline: Date.now() - 1 })).rejects.toMatchObject({
      name: "TimeoutError",
    });
    expect(a.fetchMock).not.toHaveBeenCalled();

    const b = setup([fail(429, "rate_limit_exceeded", { "retry-after": "2" }), ok()]);
    await expect(
      b.client.complete({ ...input, deadline: Date.now() + 2500 }),
    ).rejects.toMatchObject({ status: 429 });
    expect(b.fetchMock).toHaveBeenCalledTimes(1);
    expect(b.sleep).not.toHaveBeenCalled();
  });
});
