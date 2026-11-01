import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from "@simplewebauthn/server";
import type { AuthenticationResponseJSON, RegistrationResponseJSON } from "@simplewebauthn/server";
import type { Context } from "hono";
import { Hono } from "hono";
import { z } from "zod";
import { setDeviceCookie, signDeviceToken } from "../auth/deviceToken.js";
import { hasValidDeviceToken, isNativeOrigin } from "../auth/middleware.js";
import type { AppEnv } from "../deps.js";
import { badRequest, conflict, notFound } from "../errors.js";
import { clientIp } from "../lib/clientIp.js";
import { validate } from "../lib/validate.js";

type Purpose = "register" | "login" | "reauth";
type EventKind = "registered" | "verified" | "rejected" | "reauth";

const CHALLENGE_TTL_MS = 5 * 60_000;
const PASSKEY_EXISTS_MSG =
  "Tu cuenta ya tiene una passkey. Ingresá con ella (también podés usar tu teléfono con el código QR) o pedile al administrador que la restablezca.";
const UNREGISTERED_MSG = "Esta cuenta todavía no tiene una passkey registrada.";

const labelOf = (c: Context<AppEnv>, label?: string) =>
  (label?.trim() || c.req.header("user-agent") || "Dispositivo").slice(0, 80);

async function saveChallenge(c: Context<AppEnv>, purpose: Purpose, challenge: string) {
  const { sql, now } = c.get("deps");
  await sql`
    insert into webauthn_challenges (user_id, challenge, purpose, expires_at)
    values (${c.get("user").id}, ${challenge}, ${purpose}, ${new Date(now().getTime() + CHALLENGE_TTL_MS)})
    on conflict (user_id, purpose) do update set challenge = excluded.challenge, expires_at = excluded.expires_at`;
}

/** El desafío se usa una sola vez (no hay memoria entre invocaciones: vive en la base). */
async function takeChallenge(c: Context<AppEnv>, purpose: Purpose): Promise<string> {
  const { sql, now } = c.get("deps");
  const [row] = await sql<{ challenge: string; expires_at: Date }[]>`
    delete from webauthn_challenges where user_id = ${c.get("user").id} and purpose = ${purpose}
    returning challenge, expires_at`;
  if (!row || row.expires_at.getTime() < now().getTime()) {
    throw badRequest("El desafío venció. Probá de nuevo.", "challenge_expired");
  }
  return row.challenge;
}

async function logDeviceEvent(c: Context<AppEnv>, kind: EventKind, label?: string) {
  await c.get("deps").sql`
    insert into device_events (user_id, kind, label, ip)
    values (${c.get("user").id}, ${kind}, ${labelOf(c, label)}, ${clientIp(c)})`;
}

/** Emite el token: en la cookie siempre; en el cuerpo, solo para la app nativa. */
async function issueDeviceToken(c: Context<AppEnv>, credentialId: string) {
  const token = await signDeviceToken(
    c.get("deps").env.DEVICE_TOKEN_SECRET,
    c.get("user").id,
    credentialId,
  );
  setDeviceCookie(c, token);
  return c.json({ ok: true as const, ...(isNativeOrigin(c) ? { device_token: token } : {}) });
}

async function assertionOptions(c: Context<AppEnv>, purpose: "login" | "reauth") {
  const { sql, env } = c.get("deps");
  const [d] = await sql<
    { credential_id: string }[]
  >`select credential_id from devices where user_id = ${c.get("user").id}`;
  if (!d) throw notFound(UNREGISTERED_MSG, "device_unregistered");
  const options = await generateAuthenticationOptions({
    rpID: env.WEBAUTHN_RP_ID,
    allowCredentials: [{ id: d.credential_id }],
    // La reautenticación pide huella o PIN: es la prueba para una acción sensible.
    userVerification: purpose === "reauth" ? "required" : "preferred",
  });
  await saveChallenge(c, purpose, options.challenge);
  return options;
}

/** Verifica la aserción contra la passkey registrada y consume el desafío. */
async function verifyAssertion(
  c: Context<AppEnv>,
  purpose: "login" | "reauth",
  response: AuthenticationResponseJSON,
) {
  const { sql, env } = c.get("deps");
  const [d] = await sql<{ credential_id: string; public_key: Buffer; sign_count: string }[]>`
    select credential_id, public_key, sign_count from devices where user_id = ${c.get("user").id}`;
  if (!d) throw notFound(UNREGISTERED_MSG, "device_unregistered");
  const expectedChallenge = await takeChallenge(c, purpose);
  if (response.id !== d.credential_id)
    throw badRequest("Esa passkey no es la de tu cuenta.", "webauthn_failed");
  let info;
  try {
    info = await verifyAuthenticationResponse({
      response,
      expectedChallenge,
      expectedOrigin: env.WEBAUTHN_ORIGINS,
      expectedRPID: env.WEBAUTHN_RP_ID,
      credential: {
        id: d.credential_id,
        publicKey: new Uint8Array(d.public_key),
        counter: Number(d.sign_count),
      },
      requireUserVerification: purpose === "reauth",
    });
  } catch (e) {
    console.error(`[webauthn] ${purpose}/verify`, e);
    throw badRequest("No pudimos verificar tu passkey. Probá de nuevo.", "webauthn_failed");
  }
  if (!info.verified) throw badRequest("No pudimos verificar tu passkey.", "webauthn_failed");
  return { credentialId: d.credential_id, info: info.authenticationInfo };
}

const registerVerifyBody = z.object({
  response: z.custom<RegistrationResponseJSON>((v) => typeof v === "object" && v !== null),
  label: z.string().max(80).optional(),
});
const assertionBody = z.object({
  response: z.custom<AuthenticationResponseJSON>((v) => typeof v === "object" && v !== null),
});

/**
 * Rutas con JWT de Supabase pero sin token de dispositivo (son las que lo emiten). Una passkey
 * por cuenta: se registra si la cuenta no tiene; si ya tiene, solo el admin la restablece.
 */
export const device = new Hono<AppEnv>()
  .get("/status", async (c) => {
    const [d] = await c.get("deps").sql<{ label: string; last_seen_at: Date | null }[]>`
      select label, last_seen_at from devices where user_id = ${c.get("user").id}`;
    return c.json({
      registered: !!d,
      verified: await hasValidDeviceToken(c),
      label: d?.label ?? null,
      last_seen_at: d?.last_seen_at?.toISOString() ?? null,
    });
  })
  .post(
    "/register/options",
    validate("json", z.object({ label: z.string().max(80).optional() })),
    async (c) => {
      const { env } = c.get("deps");
      const user = c.get("user");
      if (user.credentialId) {
        await logDeviceEvent(c, "rejected", c.req.valid("json").label);
        throw conflict(PASSKEY_EXISTS_MSG, "passkey_exists");
      }
      const options = await generateRegistrationOptions({
        rpName: env.WEBAUTHN_RP_NAME,
        rpID: env.WEBAUTHN_RP_ID,
        userName: user.id,
        userID: new TextEncoder().encode(user.id),
        attestationType: "none",
        authenticatorSelection: { residentKey: "preferred", userVerification: "preferred" },
      });
      await saveChallenge(c, "register", options.challenge);
      return c.json(options);
    },
  )
  .post("/register/verify", validate("json", registerVerifyBody), async (c) => {
    const { sql, env } = c.get("deps");
    const user = c.get("user");
    const body = c.req.valid("json");
    if (user.credentialId) throw conflict(PASSKEY_EXISTS_MSG, "passkey_exists");
    const expectedChallenge = await takeChallenge(c, "register");
    let info;
    try {
      info = await verifyRegistrationResponse({
        response: body.response,
        expectedChallenge,
        expectedOrigin: env.WEBAUTHN_ORIGINS,
        expectedRPID: env.WEBAUTHN_RP_ID,
        requireUserVerification: false,
      });
    } catch (e) {
      console.error("[webauthn] register/verify", e);
      throw badRequest("No pudimos registrar tu passkey. Probá de nuevo.", "webauthn_failed");
    }
    if (!info.verified || !info.registrationInfo)
      throw badRequest("No pudimos registrar tu passkey.", "webauthn_failed");
    const { credential: cred, credentialDeviceType, credentialBackedUp } = info.registrationInfo;
    try {
      await sql`
        insert into devices (user_id, credential_id, public_key, sign_count, label, device_type, backed_up,
                             last_ip, last_seen_at, registered_at)
        values (${user.id}, ${cred.id}, ${Buffer.from(cred.publicKey)}, ${cred.counter}, ${labelOf(c, body.label)},
                ${credentialDeviceType}, ${credentialBackedUp}, ${clientIp(c)}, now(), now())`;
    } catch (e) {
      const err = e as { code?: string; constraint_name?: string };
      if (err.code === "23505" && err.constraint_name === "devices_pkey")
        throw conflict(PASSKEY_EXISTS_MSG, "passkey_exists");
      if (err.code === "23505")
        throw badRequest("Esa credencial ya está registrada.", "credential_taken");
      throw e;
    }
    await logDeviceEvent(c, "registered", body.label);
    return issueDeviceToken(c, cred.id);
  })
  .post("/login/options", async (c) => c.json(await assertionOptions(c, "login")))
  .post("/login/verify", validate("json", assertionBody), async (c) => {
    const { credentialId, info } = await verifyAssertion(c, "login", c.req.valid("json").response);
    await c.get("deps").sql`
      update devices set sign_count = ${info.newCounter}, backed_up = ${info.credentialBackedUp},
        last_ip = ${clientIp(c)}, last_seen_at = now()
      where user_id = ${c.get("user").id}`;
    await logDeviceEvent(c, "verified");
    return issueDeviceToken(c, credentialId);
  })
  // Reautenticación para acciones sensibles: deja una prueba de un solo uso (ver
  // requireRecentPasskey). No emite token: el ingreso normal no habilita estas acciones.
  .post("/reauth/options", async (c) => c.json(await assertionOptions(c, "reauth")))
  .post("/reauth/verify", validate("json", assertionBody), async (c) => {
    const { sql, now } = c.get("deps");
    const { info } = await verifyAssertion(c, "reauth", c.req.valid("json").response);
    await sql`
      update devices set sign_count = ${info.newCounter}, backed_up = ${info.credentialBackedUp},
        reauth_at = ${now()}
      where user_id = ${c.get("user").id}`;
    await logDeviceEvent(c, "reauth");
    return c.json({ ok: true as const });
  });
