import { errors, SignJWT, generateKeyPair, createLocalJWKSet } from "jose";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createJwtVerifier } from "../src/auth/verifier.js";
import { createSupabaseAuthAdmin } from "../src/auth/authAdmin.js";
import { newCaregiver, newMedication } from "../src/lib/schemas.js";
import "../src/lib/zodEs.js";
import { createHarness, type Harness } from "./harness.js";

const messages = (r: { success: boolean; error?: { issues: { message: string }[] } }) =>
  r.error?.issues.map((i) => i.message) ?? [];

describe("mensajes de validación en español", () => {
  it("campo que falta, campo mal tipado y exceso de largo", () => {
    expect(messages(newMedication.safeParse({ dose: "1", times: ["08:00"] }))).toEqual([
      "Falta el nombre.",
    ]);
    expect(messages(newMedication.safeParse({ name: 5, dose: "1", times: ["08:00"] }))).toEqual([
      "Revisá el nombre: el formato no es válido.",
    ]);
    expect(
      messages(newMedication.safeParse({ name: "a", dose: "1", times: Array(13).fill("08:00") })),
    ).toEqual(["Hay demasiados datos en los horarios (máximo 12)."]);
    expect(messages(newCaregiver.safeParse({ phone: "1" }))).not.toContainEqual(
      expect.stringMatching(/Invalid|expected|Too /),
    );
  });
});

describe("verifier", () => {
  const issuer = "https://x.supabase.co/auth/v1";
  it("un JWKS que no responde es 503, no «tu sesión venció»", async () => {
    const down = (() => Promise.reject(new errors.JWKSTimeout())) as never;
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { privateKey } = await generateKeyPair("ES256");
    const token = await new SignJWT({})
      .setProtectedHeader({ alg: "ES256", kid: "k" })
      .setSubject("u")
      .setIssuer(issuer)
      .setAudience("authenticated")
      .setExpirationTime("1h")
      .sign(privateKey);
    const e = await createJwtVerifier(down, issuer)
      .verify(token)
      .catch((x: unknown) => x);
    expect(e).toMatchObject({ status: 503, code: "auth_unavailable" });
    log.mockRestore();
  });

  it("un token roto sigue siendo 401 invalid_token", async () => {
    const keys = createLocalJWKSet({ keys: [] });
    const e = await createJwtVerifier(keys, issuer)
      .verify("basura")
      .catch((x: unknown) => x);
    expect(e).toMatchObject({ status: 401, code: "invalid_token" });
  });
});

describe("Supabase Auth Admin", () => {
  const origFetch = globalThis.fetch;
  const reply = (status: number, body: unknown) =>
    (globalThis.fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status })));
  const admin = createSupabaseAuthAdmin("https://x.supabase.co", "key");
  beforeEach(() => vi.spyOn(console, "error").mockImplementation(() => undefined));
  afterAll(() => {
    globalThis.fetch = origFetch;
    vi.restoreAllMocks();
  });

  it("mapea los errores de createUser", async () => {
    reply(422, { error_code: "email_exists", msg: "x" });
    expect(await admin.createUser("a@b.co").catch((e: unknown) => e)).toMatchObject({
      status: 409,
      code: "email_taken",
    });
    reply(422, { error_code: "weak_password", msg: "x" });
    expect(await admin.createUser("a@b.co", "123").catch((e: unknown) => e)).toMatchObject({
      status: 400,
      code: "weak_password",
    });
    reply(500, { msg: "boom" });
    expect(await admin.createUser("a@b.co").catch((e: unknown) => e)).toMatchObject({
      status: 502,
      code: "auth_unavailable",
    });
    globalThis.fetch = vi.fn().mockRejectedValue(new TypeError("fetch failed"));
    expect(await admin.createUser("a@b.co").catch((e: unknown) => e)).toMatchObject({
      status: 502,
      code: "auth_unavailable",
    });
  });

  it("deleteUser tolera 404 y falla claro con 5xx", async () => {
    reply(404, {});
    await expect(admin.deleteUser("id")).resolves.toBeUndefined();
    reply(500, {});
    expect(await admin.deleteUser("id").catch((e: unknown) => e)).toMatchObject({
      status: 502,
      code: "auth_unavailable",
    });
  });
});

describe("errores de la API", () => {
  let h: Harness;
  beforeAll(async () => void (h = await createHarness()));
  beforeEach(() => h.reset());
  afterAll(() => h.close());
  const body = async (r: Response) =>
    ((await r.json()) as { error: { code: string; message: string } }).error;

  it("JSON mal formado: 400 legible, no 500", async () => {
    const a = await h.admin();
    const r = await h.req("/admin/mail/test", {
      as: a,
      method: "POST",
      headers: { "Content-Type": "application/json" },
      json: undefined,
    });
    expect(r.status).toBe(400);
  });

  it("rol equivocado: dice para quién es la sección", async () => {
    const c = await h.caregiver();
    const r = await h.req("/admin/summary", { as: c });
    expect(r.status).toBe(403);
    expect(await body(r)).toEqual({
      code: "wrong_role",
      message: "Esta parte es solo para administradores/as.",
    });
  });

  it("borrar cuenta: si Auth falla avisa que los datos se borraron y a quién escribir", async () => {
    const c = await h.caregiver();
    h.failAuthDelete(true);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const r = await h.req("/me", { as: c, method: "DELETE" });
    expect(r.status).toBe(502);
    const e = await body(r);
    expect(e.code).toBe("account_delete_incomplete");
    expect(e.message).toContain("info@redasistir.online");
  });
});
