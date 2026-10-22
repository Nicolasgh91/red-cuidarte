import { describe, expect, it, vi } from "vitest";
import { createApiClient, resolveApiUrl } from "./client";
import type { ApiHooks } from "./client";
import { ApiError, unwrap } from "./errors";

const BASE = "http://api.test";
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

function setup(responses: Response[], hooks: Partial<ApiHooks> = {}) {
  const fetchImpl = vi.fn(async (..._a: Parameters<typeof fetch>) => responses.shift()!);
  const all: ApiHooks = {
    getAccessToken: async () => "jwt-1",
    getDeviceToken: () => "dev-1",
    relogin: vi.fn(async () => false),
    onAuthIssue: vi.fn(),
    ...hooks,
  };
  const api = createApiClient(BASE, all, fetchImpl as unknown as typeof fetch);
  return { api, fetchImpl, hooks: all };
}

describe("cliente de la API", () => {
  it("VITE_API_URL relativa se completa con el origen de la web; absoluta queda igual", () => {
    expect(resolveApiUrl("/api", "https://web.test")).toBe("https://web.test/api");
    expect(resolveApiUrl("https://api.test", "https://web.test")).toBe("https://api.test");
  });

  it("todo pedido lleva un límite de tiempo (no queda «Cargando…» para siempre)", async () => {
    const { api, fetchImpl } = setup([json(200, { id: "u1", role: "admin", profile: null })]);
    await api.me.$get();
    const signal = (fetchImpl.mock.calls[0]![1] as RequestInit).signal;
    expect(signal).toBeInstanceOf(AbortSignal);
    expect(signal!.aborted).toBe(false);
  });

  it("manda el JWT y el token de dispositivo en cada pedido", async () => {
    const { api, fetchImpl } = setup([json(200, { shifts: [] })]);
    const res = await api.shifts.$get({ query: { from: "2026-10-19", to: "2026-10-25" } } as never);
    expect(res.ok).toBe(true);
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(String(url)).toBe(`${BASE}/shifts?from=2026-10-19&to=2026-10-25`);
    const h = new Headers((init as RequestInit).headers);
    expect(h.get("Authorization")).toBe("Bearer jwt-1");
    expect(h.get("X-Device-Token")).toBe("dev-1");
  });

  it("403 device_login_required: repite el ingreso con passkey y reintenta el pedido", async () => {
    const relogin = vi.fn(async () => true);
    const { api, fetchImpl, hooks } = setup(
      [
        json(403, { error: { code: "device_login_required", message: "Verificá" } }),
        json(200, { id: "u1", role: "caregiver", profile: null }),
      ],
      { relogin },
    );
    const res = await api.me.$get();
    expect(res.status).toBe(200);
    expect(relogin).toHaveBeenCalledTimes(1);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(hooks.onAuthIssue).not.toHaveBeenCalled();
  });

  it("si el re-ingreso falla, avisa que hace falta verificar el dispositivo", async () => {
    const { api, hooks } = setup(
      [json(403, { error: { code: "device_login_required", message: "Verificá" } })],
      { relogin: async () => false },
    );
    const res = await api.me.$get();
    expect(res.status).toBe(403);
    expect(hooks.onAuthIssue).toHaveBeenCalledWith({
      code: "device_login_required",
      message: "Verificá",
    });
  });

  it.each(["device_unregistered", "device_blocked", "not_registered"] as const)(
    "403 %s cambia el estado de la sesión",
    async (code) => {
      const { api, hooks } = setup([json(403, { error: { code, message: "msg" } })]);
      await api.me.$get();
      expect(hooks.onAuthIssue).toHaveBeenCalledWith({ code, message: "msg" });
    },
  );

  it("otros 403 (permisos) los ve quien llama, sin tocar la sesión", async () => {
    const { api, hooks } = setup([json(403, { error: { code: "forbidden", message: "No" } })]);
    await api.me.$get();
    expect(hooks.onAuthIssue).not.toHaveBeenCalled();
  });

  it("las rutas /device/* no pasan por el manejo de 403 (lo hace el flujo de dispositivo)", async () => {
    const { api, hooks } = setup([
      json(403, { error: { code: "device_blocked", message: "Otro dispositivo" } }),
    ]);
    const res = await api.device.register.options.$post({ json: { label: "x" } } as never);
    expect(res.status).toBe(403);
    expect(hooks.onAuthIssue).not.toHaveBeenCalled();
  });

  it("401: sesión vencida", async () => {
    const { api, hooks } = setup([
      json(401, { error: { code: "unauthorized", message: "Entrá" } }),
    ]);
    await api.me.$get();
    expect(hooks.onAuthIssue).toHaveBeenCalledWith({ code: "unauthorized", message: "Entrá" });
  });
});

describe("unwrap", () => {
  it("devuelve el JSON si salió bien", async () => {
    const { api } = setup([json(200, { ok: true })]);
    await expect(unwrap(api.me.$get())).resolves.toEqual({ ok: true });
  });

  it("lanza ApiError con el mensaje del servidor", async () => {
    const { api } = setup([
      json(409, { error: { code: "conflict", message: "Se superpone con otro turno." } }),
    ]);
    const err = await unwrap(api.me.$get()).catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({
      status: 409,
      code: "conflict",
      message: "Se superpone con otro turno.",
    });
  });

  it("error de red", async () => {
    const err = await unwrap<never>(Promise.reject(new TypeError("Failed to fetch"))).catch(
      (e: unknown) => e as ApiError,
    );
    expect(err).toMatchObject({ status: 0, code: "network" });
    expect(err.message).toMatch(/conectarnos/);
  });
});
