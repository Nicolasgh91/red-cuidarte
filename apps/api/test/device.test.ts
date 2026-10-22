import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { SoftAuthenticator } from "./authenticator.js";
import { createHarness, type Harness } from "./harness.js";

let h: Harness;
beforeAll(async () => void (h = await createHarness()));
beforeEach(() => h.reset());
afterAll(() => h.close());

type Opts = { challenge: string };
const post = (
  who: string,
  path: string,
  json: unknown = {},
  headers: Record<string, string> = {},
) => h.req(`/device${path}`, { as: who, device: false, json, headers });
const code = async (r: Response) => ((await r.json()) as { error: { code: string } }).error.code;

/** Cuidador sin dispositivo todavía (primer ingreso). */
async function freshCaregiver() {
  const c = await h.caregiver();
  await h.sql`delete from devices where user_id = ${c}`;
  return c;
}

async function registerDevice(
  who: string,
  auth: SoftAuthenticator,
  label = "Chrome · Android",
  headers: Record<string, string> = {},
) {
  const opts = (await (await post(who, "/register/options", { label })).json()) as Opts;
  const r = await post(who, "/register/verify", { response: auth.register(opts), label }, headers);
  return r;
}
const withToken = (who: string, token: string, path = "/me") =>
  h.req(path, { as: who, device: false, headers: { "X-Device-Token": token } });

describe("un dispositivo por cuenta (F4)", () => {
  it("primer ingreso: registra la passkey y devuelve el token con el que se usa la API", async () => {
    const c = await freshCaregiver();
    expect((await h.req("/me", { as: c })).status).toBe(403); // todavía no hay dispositivo
    const auth = new SoftAuthenticator();
    const r = await registerDevice(c, auth, "Chrome · Android", {
      "x-forwarded-for": "192.0.2.14, 10.0.0.1",
      "user-agent": "Mozilla/5.0",
    });
    expect(r.status).toBe(200);
    const { device_token } = (await r.json()) as { device_token: string };
    expect((await withToken(c, device_token)).status).toBe(200);
    expect(
      await h.sql`select label, last_ip, credential_id from devices where user_id = ${c}`,
    ).toEqual([{ label: "Chrome · Android", last_ip: "192.0.2.14", credential_id: auth.id }]);
    expect(await (await h.req("/device/status", { as: c, device: false })).json()).toMatchObject({
      registered: true,
      label: "Chrome · Android",
    });
  });

  it("cada ingreso verifica la passkey y actualiza contador, IP y último acceso", async () => {
    const c = await freshCaregiver();
    const auth = new SoftAuthenticator();
    await registerDevice(c, auth);
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
    const { device_token } = (await r.json()) as { device_token: string };
    expect((await withToken(c, device_token)).status).toBe(200);
    expect(await h.sql`select sign_count::int, last_ip from devices where user_id = ${c}`).toEqual([
      { sign_count: 1, last_ip: "198.51.100.7" },
    ]);
  });

  it("segundo dispositivo: queda bloqueado con 403 y un intento registrado", async () => {
    const c = await freshCaregiver();
    await registerDevice(c, new SoftAuthenticator());
    const r = await post(
      c,
      "/register/options",
      { label: "Chrome · Windows" },
      { "x-forwarded-for": "203.0.113.5" },
    );
    expect(r.status).toBe(403);
    expect(await code(r)).toBe("device_blocked");
    expect(
      (
        (await (await post(c, "/register/options", { label: "Chrome · Windows" })).json()) as {
          error: { message: string };
        }
      ).error.message,
    ).toContain("administrador");
    // el mismo dispositivo insistiendo no llena la tabla de intentos
    expect(await h.sql`select label, ip, status from device_attempts where user_id = ${c}`).toEqual(
      [{ label: "Chrome · Windows", ip: "203.0.113.5", status: "blocked" }],
    );
  });

  it("ingresar con otra credencial también bloquea y registra el intento", async () => {
    const c = await freshCaregiver();
    await registerDevice(c, new SoftAuthenticator());
    const intruder = new SoftAuthenticator();
    const opts = (await (await post(c, "/login/options")).json()) as Opts;
    const r = await post(c, "/login/verify", { response: intruder.authenticate(opts) });
    expect(r.status).toBe(403);
    expect(await code(r)).toBe("device_blocked");
    expect(await h.sql`select status from device_attempts where user_id = ${c}`).toEqual([
      { status: "blocked" },
    ]);
  });

  it("tras «Liberar», el siguiente ingreso registra el dispositivo nuevo y el anterior queda sin acceso", async () => {
    const a = await h.admin();
    const c = await freshCaregiver();
    const first = new SoftAuthenticator();
    const { device_token: oldToken } = (await (await registerDevice(c, first)).json()) as {
      device_token: string;
    };
    const second = new SoftAuthenticator();
    expect((await post(c, "/register/options", { label: "Nuevo" })).status).toBe(403);

    expect((await h.req(`/admin/devices/${c}/release`, { as: a, method: "POST" })).status).toBe(
      200,
    );
    expect((await withToken(c, oldToken)).status).toBe(403); // el token viejo ya no sirve
    const r = await registerDevice(c, second, "Nuevo");
    expect(r.status).toBe(200);
    expect(
      (await withToken(c, ((await r.json()) as { device_token: string }).device_token)).status,
    ).toBe(200);
    expect((await withToken(c, oldToken)).status).toBe(403);
    expect(await h.sql`select credential_id from devices where user_id = ${c}`).toEqual([
      { credential_id: second.id },
    ]);
  });

  it("«Autorizar el nuevo» deja registrar la credencial que intentó entrar y reemplaza a la anterior (una sola vez)", async () => {
    const a = await h.admin();
    const c = await freshCaregiver();
    const first = new SoftAuthenticator();
    await registerDevice(c, first);
    const second = new SoftAuthenticator();
    expect((await post(c, "/register/options", { label: "Safari · iPhone" })).status).toBe(403);
    expect((await h.req(`/admin/devices/${c}/authorize`, { as: a, method: "POST" })).status).toBe(
      200,
    );

    const r = await registerDevice(c, second, "Safari · iPhone");
    expect(r.status).toBe(200);
    expect(await h.sql`select credential_id, label from devices where user_id = ${c}`).toEqual([
      { credential_id: second.id, label: "Safari · iPhone" },
    ]);
    expect(
      await h.sql`select 1 from device_attempts where user_id = ${c} and status = 'authorized'`,
    ).toHaveLength(0);
    // la autorización se consumió: un tercero vuelve a quedar bloqueado
    expect((await post(c, "/register/options", { label: "Otro" })).status).toBe(403);
    // y el primero ya no puede ingresar
    const opts = (await (await post(c, "/login/options")).json()) as Opts;
    expect((await post(c, "/login/verify", { response: first.authenticate(opts) })).status).toBe(
      403,
    );
  });

  it("rechaza desafíos reutilizados, vencidos, de otro origen y firmas inválidas", async () => {
    const c = await freshCaregiver();
    const auth = new SoftAuthenticator();
    // origen incorrecto
    let opts = (await (await post(c, "/register/options")).json()) as Opts;
    expect(
      (
        await post(c, "/register/verify", {
          response: auth.register(opts, { origin: "https://evil.example" }),
        })
      ).status,
    ).toBe(400);
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
    expect((await registerDevice(c, auth)).status).toBe(200);
    const lo = (await (await post(c, "/login/options")).json()) as Opts;
    expect(
      (await post(c, "/login/verify", { response: auth.authenticate(lo, { badSignature: true }) }))
        .status,
    ).toBe(400);
  });

  it("login sin dispositivo registrado → 404; verify sin pedir opciones → 400", async () => {
    const c = await freshCaregiver();
    expect((await post(c, "/login/options")).status).toBe(404);
    const auth = new SoftAuthenticator();
    expect(
      (await post(c, "/register/verify", { response: auth.register({ challenge: "x" }) })).status,
    ).toBe(400);
  });

  it("vale para los tres roles: administrador y persona cuidada también se vinculan", async () => {
    const a = await h.admin();
    const p = await h.patient({ email: "p@example.org" });
    for (const who of [a, p]) {
      await h.sql`delete from devices where user_id = ${who}`;
      expect((await registerDevice(who, new SoftAuthenticator())).status).toBe(200);
      expect((await post(who, "/register/options")).status).toBe(403);
    }
  });

  it("las rutas /device exigen sesión", async () => {
    expect((await h.req("/device/status")).status).toBe(401);
  });
});
