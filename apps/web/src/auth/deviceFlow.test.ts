import { describe, expect, it, vi } from "vitest";
import { ApiError } from "../api/errors";
import { DeviceController } from "./controller";
import { establishDevice } from "./deviceFlow";
import type { DeviceApi, Passkeys } from "./deviceFlow";
import type { DeviceStore } from "./deviceStore";
import { AuthFlowError } from "./services";

function memoryStore(): DeviceStore {
  let token: string | null = null;
  let verifiedUser: string | null = null;
  return {
    getToken: () => token,
    setToken: (t) => (token = t),
    isVerified: (u) => verifiedUser === u,
    setVerified: (u) => (verifiedUser = u),
    clear: () => {
      token = null;
      verifiedUser = null;
    },
  };
}

function setup(over: Partial<DeviceApi> = {}, store = memoryStore()) {
  const api: DeviceApi = {
    status: vi.fn(async () => ({ registered: false, verified: false })),
    registerOptions: vi.fn(async () => ({ challenge: "c1" })),
    registerVerify: vi.fn(async () => ({})),
    loginOptions: vi.fn(async () => ({ challenge: "c2" })),
    loginVerify: vi.fn(async () => ({})),
    reauthOptions: vi.fn(async () => ({ challenge: "c3" })),
    reauthVerify: vi.fn(async () => ({ ok: true })),
    ...over,
  };
  const passkeys: Passkeys = {
    register: vi.fn(async () => ({ id: "cred-1" })),
    login: vi.fn(async () => ({ id: "cred-1" })),
  };
  const deps = { api, passkeys, store, userId: "u1", label: "Chrome · Android" };
  return { api, passkeys, store, deps };
}

describe("establishDevice", () => {
  it("cuenta sin passkey: la registra; en la web el token queda en la cookie, no acá", async () => {
    const { deps, api, store } = setup();
    expect(await establishDevice(deps)).toEqual({ kind: "ready" });
    expect(api.registerOptions).toHaveBeenCalledWith("Chrome · Android");
    expect(api.registerVerify).toHaveBeenCalledWith({ id: "cred-1" }, "Chrome · Android");
    expect(store.getToken()).toBeNull();
    expect(store.isVerified("u1")).toBe(true);
  });

  it("app nativa: guarda el token que viene en el cuerpo", async () => {
    const { deps, store } = setup({ registerVerify: vi.fn(async () => ({ device_token: "tok" })) });
    await establishDevice(deps);
    expect(store.getToken()).toBe("tok");
  });

  it("cuenta con passkey: la verifica (puede estar en otro equipo), no registra otra", async () => {
    const { deps, api, passkeys, store } = setup({
      status: vi.fn(async () => ({ registered: true, verified: false })),
    });
    expect(await establishDevice(deps)).toEqual({ kind: "ready" });
    expect(passkeys.login).toHaveBeenCalled();
    expect(api.registerOptions).not.toHaveBeenCalled();
    expect(store.isVerified("u1")).toBe(true);
  });

  it("con el token vigente no pide la passkey", async () => {
    const { deps, passkeys, store } = setup({
      status: vi.fn(async () => ({ registered: true, verified: true })),
    });
    expect(await establishDevice(deps)).toEqual({ kind: "ready" });
    expect(passkeys.login).not.toHaveBeenCalled();
    expect(passkeys.register).not.toHaveBeenCalled();
    expect(store.isVerified("u1")).toBe(true);
  });

  it("not_registered de la API", async () => {
    const { deps } = setup({
      status: vi.fn(async () => {
        throw new ApiError(403, "not_registered", "sin alta");
      }),
    });
    expect(await establishDevice(deps)).toEqual({ kind: "not_registered" });
  });

  it("otros errores (p. ej. el usuario cancela la passkey) se propagan", async () => {
    const { deps, passkeys, store } = setup();
    vi.mocked(passkeys.register).mockRejectedValue(
      Object.assign(new Error("cancelado"), { name: "NotAllowedError" }),
    );
    await expect(establishDevice(deps)).rejects.toThrow("cancelado");
    expect(store.isVerified("u1")).toBe(false);
  });
});

describe("DeviceController", () => {
  function controller(over: Partial<DeviceApi> = {}) {
    const s = setup(over);
    const ctl = new DeviceController({
      deviceApi: () => s.api,
      passkeys: s.passkeys,
      store: s.store,
      supported: () => true,
    });
    ctl.setUser("u1");
    return { ...s, ctl };
  }

  it("check devuelve el evento de la máquina de estados", async () => {
    const { ctl } = controller();
    expect(await ctl.check({ interactive: true })).toEqual({ type: "device_ok" });
  });

  it("sin gesto (arranque automático) un NotAllowedError no se muestra como error", async () => {
    const { ctl, passkeys } = controller();
    vi.mocked(passkeys.register).mockRejectedValue(
      Object.assign(new Error("x"), { name: "NotAllowedError" }),
    );
    expect(await ctl.check({ interactive: false })).toEqual({
      type: "device_prompt",
      phase: "register",
      error: null,
    });
    const manual = await ctl.check({ interactive: true });
    expect(manual).toMatchObject({ type: "device_prompt", phase: "register" });
    expect((manual as { error: string }).error).toMatch(/No se completó/);
  });

  it("si no se completa el ingreso, sugiere el QR del teléfono o pedir al admin", async () => {
    const { ctl, passkeys } = controller({
      status: vi.fn(async () => ({ registered: true, verified: false })),
    });
    vi.mocked(passkeys.login).mockRejectedValue(
      Object.assign(new Error("x"), { name: "NotAllowedError" }),
    );
    const r = (await ctl.check({ interactive: true })) as { phase: string; error: string };
    expect(r.phase).toBe("login");
    expect(r.error).toMatch(/código QR/);
    expect(r.error).toMatch(/administrador/);
  });

  it("la cuenta ya tiene passkey (409): muestra el mensaje del servidor", async () => {
    const { ctl } = controller({
      registerOptions: vi.fn(async () => {
        throw new ApiError(409, "passkey_exists", "Tu cuenta ya tiene una passkey.");
      }),
    });
    expect(await ctl.check({ interactive: true })).toEqual({
      type: "device_prompt",
      phase: "register",
      error: "Tu cuenta ya tiene una passkey.",
    });
  });

  it("no corre dos verificaciones a la vez", async () => {
    const { ctl } = controller();
    const [a, b] = await Promise.all([
      ctl.check({ interactive: true }),
      ctl.check({ interactive: true }),
    ]);
    expect([a, b].filter((x) => x === null)).toHaveLength(1);
  });

  it("relogin comparte un único intento y devuelve false si falla", async () => {
    const { ctl, api, passkeys } = controller();
    const [a, b] = await Promise.all([ctl.relogin(), ctl.relogin()]);
    expect([a, b]).toEqual([true, true]);
    expect(api.loginOptions).toHaveBeenCalledTimes(1);
    vi.mocked(passkeys.login).mockRejectedValue(new Error("no"));
    expect(await ctl.relogin()).toBe(false);
  });

  it("reauth pide la passkey siempre, aunque el token siga vigente", async () => {
    const { ctl, api, passkeys } = controller({
      status: vi.fn(async () => ({ registered: true, verified: true })),
    });
    await ctl.reauth();
    await ctl.reauth();
    expect(passkeys.login).toHaveBeenCalledTimes(2);
    expect(api.reauthVerify).toHaveBeenCalledTimes(2);
    expect(api.status).not.toHaveBeenCalled();
    expect(api.loginVerify).not.toHaveBeenCalled();
  });

  it("reauth cancelada: lanza AuthFlowError con el mensaje y no llama a la API", async () => {
    const { ctl, api, passkeys } = controller();
    vi.mocked(passkeys.login).mockRejectedValue(
      Object.assign(new Error("x"), { name: "NotAllowedError" }),
    );
    const err = await ctl.reauth().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AuthFlowError);
    expect((err as Error).message).toMatch(/No se completó/);
    expect(api.reauthVerify).not.toHaveBeenCalled();
  });
});
