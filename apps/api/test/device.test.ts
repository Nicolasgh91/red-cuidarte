import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { SoftAuthenticator } from "./authenticator.js";
import { createHarness, deviceCookie, type Harness } from "./harness.js";

let h: Harness;
beforeAll(async () => void (h = await createHarness()));
beforeEach(() => h.reset());
afterAll(() => h.close());

type Opts = { challenge: string };
const WEB = "https://redasistir.online";
const NATIVE = "capacitor://localhost";

const post = (
  who: string,
  path: string,
  json: unknown = {},
  headers: Record<string, string> = {},
) => h.req(`/device${path}`, { as: who, device: false, json, headers });
const code = async (r: Response) => ((await r.json()) as { error: { code: string } }).error.code;

/** Token que dejó la API en la cookie (null si no emitió ninguna). */
const tokenOf = (r: Response) =>
  /__Host-cuidarte_device=([^;]+)/.exec(r.headers.get("set-cookie") ?? "")?.[1] ?? null;

/** Pedido con la cookie del token, como lo hace el navegador. */
const withCookie = (who: string, token: string, path = "/me", init: { json?: unknown } = {}) =>
  h.req(path, { as: who, device: false, headers: { Cookie: deviceCookie(token) }, ...init });

/** Usuario sin passkey todavía (primer ingreso). */
async function withoutPasskey(make: () => Promise<string> = () => h.caregiver()) {
  const id = await make();
  await h.sql`delete from devices where user_id = ${id}`;
  return id;
}

async function registerPasskey(
  who: string,
  auth: SoftAuthenticator,
  label = "Chrome · Android",
  headers: Record<string, string> = {},
) {
  const opts = (await (await post(who, "/register/options", { label })).json()) as Opts;
  return post(who, "/register/verify", { response: auth.register(opts), label }, headers);
}

async function loginPasskey(
  who: string,
  auth: SoftAuthenticator,
  headers: Record<string, string> = {},
) {
  const opts = (await (await post(who, "/login/options")).json()) as Opts;
  return post(who, "/login/verify", { response: auth.authenticate(opts) }, headers);
}

describe("passkey de la cuenta (F6)", () => {
  it("primer ingreso: registra la passkey y deja el token en una cookie HttpOnly, no en el cuerpo", async () => {
    const c = await withoutPasskey();
    expect((await h.req("/me", { as: c })).status).toBe(403); // todavía no hay passkey
    const auth = new SoftAuthenticator();
    const r = await registerPasskey(c, auth, "Chrome · Android", {
      Origin: WEB,
      "x-forwarded-for": "192.0.2.14, 10.0.0.1",
      "user-agent": "Mozilla/5.0",
    });
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ ok: true });
    const token = tokenOf(r)!;
    expect(r.headers.get("set-cookie")).toBe(
      `__Host-cuidarte_device=${token}; Max-Age=2592000; Path=/; HttpOnly; Secure; SameSite=Strict`,
    );
    expect((await withCookie(c, token)).status).toBe(200);
    expect(
      await h.sql`select label, last_ip, credential_id, device_type, backed_up from devices where user_id = ${c}`,
    ).toEqual([
      {
        label: "Chrome · Android",
        last_ip: "192.0.2.14",
        credential_id: auth.id,
        device_type: "singleDevice",
        backed_up: false,
      },
    ]);
    expect(await (await withCookie(c, token, "/device/status")).json()).toMatchObject({
      registered: true,
      verified: true,
      label: "Chrome · Android",
    });
  });

  it("la app nativa recibe además el token en el cuerpo y lo usa en X-Device-Token", async () => {
    const c = await withoutPasskey();
    const r = await registerPasskey(c, new SoftAuthenticator(), "App", { Origin: NATIVE });
    const { device_token } = (await r.json()) as { device_token: string };
    expect(device_token).toBe(tokenOf(r));
    const me = await h.req("/me", {
      as: c,
      device: false,
      headers: { Origin: NATIVE, "X-Device-Token": device_token },
    });
    expect(me.status).toBe(200);
  });

  it("cada ingreso verifica la passkey y actualiza contador, IP, respaldo y último acceso", async () => {
    const c = await withoutPasskey();
    const auth = new SoftAuthenticator();
    await registerPasskey(c, auth);
    const opts = (await (await post(c, "/login/options")).json()) as Opts & {
      allowCredentials: { id: string }[];
    };
    expect(opts.allowCredentials).toEqual([expect.objectContaining({ id: auth.id })]);
    const r = await post(
      c,
      "/login/verify",
      { response: auth.authenticate(opts) },
      { "x-forwarded-for": "198.51.100.7" },
    );
    expect(r.status).toBe(200);
    expect((await withCookie(c, tokenOf(r)!)).status).toBe(200);
    expect(await h.sql`select sign_count::int, last_ip from devices where user_id = ${c}`).toEqual([
      { sign_count: 1, last_ip: "198.51.100.7" },
    ]);
  });

  it("una passkey sincronizada sirve desde otro equipo y queda marcada como sincronizable", async () => {
    const c = await withoutPasskey();
    const auth = new SoftAuthenticator();
    auth.synced = true;
    await registerPasskey(c, auth, "Chrome · Android");
    expect(await h.sql`select device_type, backed_up from devices where user_id = ${c}`).toEqual([
      { device_type: "multiDevice", backed_up: true },
    ]);
    // la misma credencial, desde una notebook
    const r = await loginPasskey(c, auth, {
      "user-agent": "Chrome · Windows",
      "x-forwarded-for": "203.0.113.9",
    });
    expect(r.status).toBe(200);
    expect((await withCookie(c, tokenOf(r)!)).status).toBe(200);
  });

  it("si la cuenta ya tiene passkey no se puede registrar otra (409)", async () => {
    const c = await withoutPasskey();
    await registerPasskey(c, new SoftAuthenticator());
    const r = await post(c, "/register/options", { label: "Chrome · Windows" });
    expect(r.status).toBe(409);
    const body = (await r.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe("passkey_exists");
    expect(body.error.message).toContain("administrador");
    const other = new SoftAuthenticator();
    expect(
      await code(
        await post(c, "/register/verify", { response: other.register({ challenge: "x" }) }),
      ),
    ).toBe("passkey_exists");
  });

  it("exige verificación de usuario (huella, rostro o PIN) al registrar y al ingresar", async () => {
    const c = await withoutPasskey();
    const auth = new SoftAuthenticator();
    const ro = (await (await post(c, "/register/options")).json()) as Opts & {
      authenticatorSelection: { userVerification: string };
    };
    expect(ro.authenticatorSelection.userVerification).toBe("required");
    const bad = await post(c, "/register/verify", {
      response: auth.register(ro, { noUserVerification: true }),
    });
    expect(await code(bad)).toBe("webauthn_user_verification");
    expect(tokenOf(bad)).toBeNull();

    expect((await registerPasskey(c, auth)).status).toBe(200);
    const lo = (await (await post(c, "/login/options")).json()) as Opts & {
      userVerification: string;
    };
    expect(lo.userVerification).toBe("required");
    const r = await post(c, "/login/verify", {
      response: auth.authenticate(lo, { noUserVerification: true }),
    });
    expect(await code(r)).toBe("webauthn_user_verification");
    expect(tokenOf(r)).toBeNull();
  });

  it("ingresar con otra credencial no emite token", async () => {
    const c = await withoutPasskey();
    await registerPasskey(c, new SoftAuthenticator());
    const r = await loginPasskey(c, new SoftAuthenticator());
    expect(r.status).toBe(400);
    expect(await code(r)).toBe("webauthn_failed");
    expect(tokenOf(r)).toBeNull();
  });

  it("revocación efectiva: al restablecer la passkey, la cookie vigente deja de servir enseguida", async () => {
    const a = await h.admin();
    const c = await withoutPasskey();
    const first = new SoftAuthenticator();
    const oldToken = tokenOf(await registerPasskey(c, first))!;
    expect((await withCookie(c, oldToken)).status).toBe(200);

    expect((await h.req(`/admin/devices/${c}/release`, { as: a, method: "POST" })).status).toBe(
      200,
    );
    const r = await withCookie(c, oldToken);
    expect(r.status).toBe(403);
    expect(await code(r)).toBe("device_unregistered");
    expect(await code(await post(c, "/login/options"))).toBe("device_unregistered");

    // registra una nueva; la vieja ni su token vuelven a servir
    const second = new SoftAuthenticator();
    const nr = await registerPasskey(c, second, "Nuevo");
    expect(nr.status).toBe(200);
    expect((await withCookie(c, tokenOf(nr)!)).status).toBe(200);
    expect(await code(await withCookie(c, oldToken))).toBe("device_login_required");
    expect((await loginPasskey(c, first)).status).toBe(400);
  });

  it("cierre de sesión persistente: /logout borra la cookie y el siguiente pedido pide la passkey", async () => {
    const c = await withoutPasskey();
    await registerPasskey(c, new SoftAuthenticator());
    const r = await h.req("/logout", { method: "POST", headers: { Origin: WEB } });
    expect(r.status).toBe(200);
    expect(r.headers.get("set-cookie")).toBe(
      "__Host-cuidarte_device=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Strict",
    );
    // el navegador aplica el borrado: los pedidos siguientes van sin cookie
    expect(await (await h.req("/device/status", { as: c, device: false })).json()).toMatchObject({
      registered: true,
      verified: false,
    });
    expect(await code(await h.req("/me", { as: c, device: false }))).toBe("device_login_required");
  });

  it("/logout solo acepta orígenes conocidos (CSRF)", async () => {
    for (const headers of [{ Origin: "https://evil.example" }, {}] as Record<string, string>[]) {
      const r = await h.req("/logout", { method: "POST", headers });
      expect(r.status).toBe(403);
      expect(r.headers.get("set-cookie")).toBeNull();
    }
    expect((await h.req("/logout", { method: "POST", headers: { Origin: NATIVE } })).status).toBe(
      200,
    );
  });

  it("rechaza desafíos reutilizados, vencidos, de otro origen y firmas inválidas", async () => {
    const c = await withoutPasskey();
    const auth = new SoftAuthenticator();
    // origen incorrecto
    let opts = (await (await post(c, "/register/options")).json()) as Opts;
    const wrongOrigin = await post(c, "/register/verify", {
      response: auth.register(opts, { origin: "https://evil.example" }),
    });
    expect(wrongOrigin.status).toBe(400);
    expect(await wrongOrigin.json()).toEqual({
      error: {
        code: "webauthn_origin",
        message: `Esta dirección no está habilitada para passkeys. Entrá desde ${WEB}.`,
      },
    });
    // el desafío se consume aunque falle: reutilizarlo no sirve
    expect((await post(c, "/register/verify", { response: auth.register(opts) })).status).toBe(400);
    // vencido
    opts = (await (await post(c, "/register/options")).json()) as Opts;
    h.setNow(new Date(h.deps.now().getTime() + 6 * 60_000));
    expect(await code(await post(c, "/register/verify", { response: auth.register(opts) }))).toBe(
      "challenge_expired",
    );
    h.setNow(new Date("2026-10-21T15:00:00Z"));
    // registro correcto, luego firma inválida
    expect((await registerPasskey(c, auth)).status).toBe(200);
    const lo = (await (await post(c, "/login/options")).json()) as Opts;
    expect(
      (await post(c, "/login/verify", { response: auth.authenticate(lo, { badSignature: true }) }))
        .status,
    ).toBe(400);
  });

  it("un segundo pedido de opciones invalida el desafío anterior (otra pestaña)", async () => {
    const c = await withoutPasskey();
    const auth = new SoftAuthenticator();
    const first = (await (await post(c, "/register/options")).json()) as Opts;
    await post(c, "/register/options");
    const r = await post(c, "/register/verify", { response: auth.register(first) });
    expect(await code(r)).toBe("webauthn_challenge");
    expect(tokenOf(r)).toBeNull();
    // después del rechazo se puede volver a intentar
    expect((await registerPasskey(c, auth)).status).toBe(200);
  });

  it("rechaza una passkey creada para otro rpId", async () => {
    const c = await withoutPasskey();
    const r = await registerPasskey(c, new SoftAuthenticator("evil.example", WEB));
    expect(await code(r)).toBe("webauthn_failed");
    expect(tokenOf(r)).toBeNull();
  });

  it("login sin passkey registrada → 404; verify sin pedir opciones → 400", async () => {
    const c = await withoutPasskey();
    expect((await post(c, "/login/options")).status).toBe(404);
    const auth = new SoftAuthenticator();
    expect(
      (await post(c, "/register/verify", { response: auth.register({ challenge: "x" }) })).status,
    ).toBe(400);
  });

  it("vale para los tres roles: administrador y paciente también registran su passkey", async () => {
    const a = await withoutPasskey(() => h.admin());
    const p = await withoutPasskey(() => h.patient({ email: "p@example.org" }));
    for (const who of [a, p]) {
      expect((await registerPasskey(who, new SoftAuthenticator())).status).toBe(200);
      expect((await post(who, "/register/options")).status).toBe(409);
    }
  });

  it("las rutas /device exigen sesión", async () => {
    expect((await h.req("/device/status")).status).toBe(401);
  });
});
