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

afterEach(() => void vi.unstubAllGlobals());

describe("cliente de Groq", () => {
  it("429 con retry-after corto: espera y reintenta una vez", async () => {
    const { fetchMock, sleep, client } = setup([
      fail(429, "rate_limit_exceeded", { "retry-after": "2" }),
      ok(),
    ]);
    expect(await client.complete(input)).toEqual({ content: "Hola.", tool_calls: [] });
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

  it("pide razonamiento bajo solo a los modelos gpt-oss", async () => {
    const body = (m: ReturnType<typeof setup>["fetchMock"]) =>
      JSON.parse((m.mock.calls[0] as unknown as [string, RequestInit])[1].body as string) as Record<
        string,
        unknown
      >;
    const a = setup([ok()]);
    await a.client.complete(input);
    expect(body(a.fetchMock).reasoning_effort).toBe("low");
    const b = setup([ok()], "llama-3.3-70b-versatile");
    await b.client.complete(input);
    expect(body(b.fetchMock)).not.toHaveProperty("reasoning_effort");
  });
});
