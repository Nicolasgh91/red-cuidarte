import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createHarness, type Harness } from "./harness.js";

let h: Harness;
beforeAll(async () => void (h = await createHarness()));
beforeEach(() => h.reset());
afterEach(() => void (h.deps.env.PASSKEYS_ENABLED = true));
afterAll(() => h.close());

const code = async (r: Response) => ((await r.json()) as { error: { code: string } }).error.code;

describe("feature flag PASSKEYS_ENABLED apagado", () => {
  beforeEach(() => void (h.deps.env.PASSKEYS_ENABLED = false));

  it("las rutas protegidas andan solo con el JWT, sin passkey ni token de dispositivo", async () => {
    const c = await h.caregiver();
    await h.sql`delete from devices where user_id = ${c}`;
    const r = await h.req("/me", { as: c, device: false });
    expect(r.status).toBe(200);
  });

  it("sigue exigiendo sesión y alta de la cuenta", async () => {
    expect((await h.req("/me")).status).toBe(401);
    const r = await h.req("/me", { as: crypto.randomUUID(), device: false });
    expect(r.status).toBe(403);
    expect(await code(r)).toBe("not_registered");
  });

  it("/device/status informa enabled:false", async () => {
    const c = await h.caregiver();
    const r = await h.req("/device/status", { as: c, device: false });
    expect(r.status).toBe(200);
    expect(((await r.json()) as { enabled: boolean }).enabled).toBe(false);
  });

  it.each(["/register/options", "/register/verify", "/login/options", "/login/verify"])(
    "/device%s → 404 passkeys_disabled",
    async (path) => {
      const c = await h.caregiver();
      const r = await h.req(`/device${path}`, { as: c, device: false, json: {} });
      expect(r.status).toBe(404);
      expect(await code(r)).toBe("passkeys_disabled");
    },
  );
});

describe("feature flag PASSKEYS_ENABLED encendido", () => {
  it("/device/status informa enabled:true y se sigue exigiendo el token", async () => {
    const c = await h.caregiver();
    const s = await h.req("/device/status", { as: c, device: false });
    expect(((await s.json()) as { enabled: boolean }).enabled).toBe(true);
    const r = await h.req("/me", { as: c, device: false });
    expect(await code(r)).toBe("device_login_required");
  });
});
