import { describe, expect, it, vi } from "vitest";
import { ApiError } from "../api/errors";
import { DeviceController } from "./controller";
import { establishDevice } from "./deviceFlow";
import type { DeviceApi, Passkeys } from "./deviceFlow";
import type { DeviceStore } from "./deviceStore";

function memoryStore(init: { token?: string; credential?: [string, string] } = {}): DeviceStore {
  let token = init.token ?? null;
  let cred: [string, string] | null = init.credential ?? null;
  return {
    getToken: () => token,
    setToken: (t) => (token = t),
    clearToken: () => (token = null),
    getCredential: (u) => (cred && cred[0] === u ? cred[1] : null),
    setCredential: (u, id) => (cred = [u, id]),
    clearCredential: () => (cred = null),
  };
}

function setup(over: Partial<DeviceApi> = {}, store = memoryStore()) {
  const api: DeviceApi = {
    status: vi.fn(async () => ({ registered: false })),
    registerOptions: vi.fn(async () => ({ challenge: "c1" })),
    registerVerify: vi.fn(async () => ({ device_token: "tok-reg" })),
    loginOptions: vi.fn(async () => ({ challenge: "c2" })),
    loginVerify: vi.fn(async () => ({ device_token: "tok-login" })),
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
  it("cuenta sin dispositivo: registra la passkey y guarda credencial y token", async () => {
    const { deps, api, store } = setup();
    expect(await establishDevice(deps)).toEqual({ kind: "ready" });
    expect(api.registerOptions).toHaveBeenCalledWith("Chrome · Android");
    expect(api.registerVerify).toHaveBeenCalledWith({ id: "cred-1" }, "Chrome · Android");
    expect(store.getToken()).toBe("tok-reg");
    expect(store.getCredential("u1")).toBe("cred-1");
  });

  it("con credencial guardada y cuenta registrada: verifica (login), no registra", async () => {
    const store = memoryStore({ credential: ["u1", "cred-1"] });
    const { deps, api, passkeys } = setup(
      { status: vi.fn(async () => ({ registered: true })) },
      store,
    );
    expect(await establishDevice(deps)).toEqual({ kind: "ready" });
    expect(passkeys.login).toHaveBeenCalled();
    expect(api.registerOptions).not.toHaveBeenCalled();
    expect(store.getToken()).toBe("tok-login");
  });

  it("cuenta registrada en otro dispositivo (sin credencial acá): intenta registrar y queda bloqueado", async () => {
    const blocked = new ApiError(
      403,
      "device_blocked",
      "Tu cuenta ya está registrada en otro dispositivo.",
    );
    const { deps, store } = setup({
      status: vi.fn(async () => ({ registered: true })),
      registerOptions: vi.fn(async () => {
        throw blocked;
      }),
    });
    expect(await establishDevice(deps)).toEqual({ kind: "blocked", message: blocked.message });
    expect(store.getToken()).toBeNull();
  });

  it("el admin liberó la cuenta: la credencial local se descarta y se registra de nuevo", async () => {
    const store = memoryStore({ credential: ["u1", "vieja"] });
    const { deps, api } = setup(
      {
        status: vi.fn(async () => ({ registered: true })),
        loginOptions: vi.fn(async () => {
          throw new ApiError(404, "device_unregistered", "sin dispositivo");
        }),
      },
      store,
    );
    expect(await establishDevice(deps)).toEqual({ kind: "ready" });
    expect(api.registerVerify).toHaveBeenCalled();
    expect(store.getCredential("u1")).toBe("cred-1");
  });

  it("la credencial de otro usuario en este navegador no se usa", async () => {
    const store = memoryStore({ credential: ["otro", "cred-x"] });
    const { deps, passkeys } = setup({ status: vi.fn(async () => ({ registered: false })) }, store);
    await establishDevice(deps);
    expect(passkeys.login).not.toHaveBeenCalled();
    expect(passkeys.register).toHaveBeenCalled();
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
    const { deps, passkeys } = setup();
    vi.mocked(passkeys.register).mockRejectedValue(
      Object.assign(new Error("cancelado"), { name: "NotAllowedError" }),
    );
    await expect(establishDevice(deps)).rejects.toThrow("cancelado");
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
});
