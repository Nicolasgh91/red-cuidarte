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
import { signDeviceToken } from "../auth/deviceToken.js";
import type { AppEnv } from "../deps.js";
import { badRequest, forbidden, notFound } from "../errors.js";
import { validate } from "../lib/validate.js";

const CHALLENGE_TTL_MS = 5 * 60_000;
const BLOCKED_MSG =
  "Tu cuenta ya está registrada en otro dispositivo. Pedile al administrador que la libere o que autorice este dispositivo.";

const clientIp = (c: Context<AppEnv>) =>
  c.req.header("x-forwarded-for")?.split(",")[0]?.trim() || c.req.header("x-real-ip") || null;
const labelOf = (c: Context<AppEnv>, label?: string) =>
  (label?.trim() || c.req.header("user-agent") || "Dispositivo").slice(0, 80);

async function saveChallenge(c: Context<AppEnv>, purpose: "register" | "login", challenge: string) {
  const { sql, now } = c.get("deps");
  await sql`
    insert into webauthn_challenges (user_id, challenge, purpose, expires_at)
    values (${c.get("user").id}, ${challenge}, ${purpose}, ${new Date(now().getTime() + CHALLENGE_TTL_MS)})
    on conflict (user_id, purpose) do update set challenge = excluded.challenge, expires_at = excluded.expires_at`;
}

/** El desafío se usa una sola vez (no hay memoria entre invocaciones: vive en la base). */
async function takeChallenge(c: Context<AppEnv>, purpose: "register" | "login"): Promise<string> {
  const { sql, now } = c.get("deps");
  const [row] = await sql<{ challenge: string; expires_at: Date }[]>`
    delete from webauthn_challenges where user_id = ${c.get("user").id} and purpose = ${purpose}
    returning challenge, expires_at`;
  if (!row || row.expires_at.getTime() < now().getTime()) {
    throw badRequest("El desafío venció. Probá de nuevo.", "challenge_expired");
  }
  return row.challenge;
}

async function recordBlockedAttempt(c: Context<AppEnv>, label?: string) {
  const { sql } = c.get("deps");
  const userId = c.get("user").id;
  const l = labelOf(c, label);
  // Reintentos seguidos del mismo dispositivo actualizan el mismo intento.
  const updated = await sql`
    update device_attempts set at = now(), ip = coalesce(${clientIp(c)}, ip)
    where id = (select id from device_attempts where user_id = ${userId} and status = 'blocked' and label = ${l}
                and at > now() - interval '10 minutes' order by at desc limit 1)
    returning id`;
  if (!updated.length) {
    await sql`insert into device_attempts (user_id, label, ip, status) values (${userId}, ${l}, ${clientIp(c)}, 'blocked')`;
  }
}

const registerVerifyBody = z.object({
  response: z.custom<RegistrationResponseJSON>((v) => typeof v === "object" && v !== null),
  label: z.string().max(80).optional(),
});
const loginVerifyBody = z.object({
  response: z.custom<AuthenticationResponseJSON>((v) => typeof v === "object" && v !== null),
});

// Rutas con JWT de Supabase pero sin token de dispositivo (son las que lo emiten).
export const device = new Hono<AppEnv>()
  .get("/status", async (c) => {
    const [d] = await c.get("deps").sql<{ label: string; last_seen_at: Date | null }[]>`
      select label, last_seen_at from devices where user_id = ${c.get("user").id}`;
    return c.json({
      registered: !!d,
      label: d?.label ?? null,
      last_seen_at: d?.last_seen_at?.toISOString() ?? null,
    });
  })
  .post(
    "/register/options",
    validate("json", z.object({ label: z.string().max(80).optional() })),
    async (c) => {
      const { sql, env } = c.get("deps");
      const user = c.get("user");
      if (user.credentialId) {
        const [auth] =
          await sql`select 1 from device_attempts where user_id = ${user.id} and status = 'authorized' limit 1`;
        if (!auth) {
          await recordBlockedAttempt(c, c.req.valid("json").label);
          throw forbidden(BLOCKED_MSG, "device_blocked");
        }
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
    if (user.credentialId) {
      const [auth] =
        await sql`select 1 from device_attempts where user_id = ${user.id} and status = 'authorized' limit 1`;
      if (!auth) throw forbidden(BLOCKED_MSG, "device_blocked");
    }
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
    } catch {
      throw badRequest("No pudimos verificar este dispositivo. Probá de nuevo.", "webauthn_failed");
    }
    if (!info.verified || !info.registrationInfo)
      throw badRequest("No pudimos verificar este dispositivo.", "webauthn_failed");
    const cred = info.registrationInfo.credential;
    try {
      await sql.begin(async (tx) => {
        await tx`
          insert into devices (user_id, credential_id, public_key, sign_count, label, last_ip, last_seen_at, registered_at)
          values (${user.id}, ${cred.id}, ${Buffer.from(cred.publicKey)}, ${cred.counter}, ${labelOf(c, body.label)}, ${clientIp(c)}, now(), now())
          on conflict (user_id) do update set credential_id = excluded.credential_id, public_key = excluded.public_key,
            sign_count = excluded.sign_count, label = excluded.label, last_ip = excluded.last_ip,
            last_seen_at = now(), registered_at = now()`;
        // La autorización del admin se usa una sola vez.
        await tx`delete from device_attempts where user_id = ${user.id} and status = 'authorized'`;
      });
    } catch (e) {
      if ((e as { code?: string }).code === "23505")
        throw badRequest("Esa credencial ya está registrada.", "credential_taken");
      throw e;
    }
    return c.json({
      device_token: await signDeviceToken(env.DEVICE_TOKEN_SECRET, user.id, cred.id),
    });
  })
  .post("/login/options", async (c) => {
    const { sql, env } = c.get("deps");
    const [d] = await sql<
      { credential_id: string }[]
    >`select credential_id from devices where user_id = ${c.get("user").id}`;
    if (!d)
      throw notFound(
        "Esta cuenta todavía no tiene un dispositivo registrado.",
        "device_unregistered",
      );
    const options = await generateAuthenticationOptions({
      rpID: env.WEBAUTHN_RP_ID,
      allowCredentials: [{ id: d.credential_id }],
      userVerification: "preferred",
    });
    await saveChallenge(c, "login", options.challenge);
    return c.json(options);
  })
  .post("/login/verify", validate("json", loginVerifyBody), async (c) => {
    const { sql, env } = c.get("deps");
    const user = c.get("user");
    const { response } = c.req.valid("json");
    const [d] = await sql<{ credential_id: string; public_key: Buffer; sign_count: string }[]>`
      select credential_id, public_key, sign_count from devices where user_id = ${user.id}`;
    if (!d)
      throw notFound(
        "Esta cuenta todavía no tiene un dispositivo registrado.",
        "device_unregistered",
      );
    if (response.id !== d.credential_id) {
      await recordBlockedAttempt(c);
      throw forbidden(BLOCKED_MSG, "device_blocked");
    }
    const expectedChallenge = await takeChallenge(c, "login");
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
        requireUserVerification: false,
      });
    } catch {
      throw badRequest("No pudimos verificar este dispositivo. Probá de nuevo.", "webauthn_failed");
    }
    if (!info.verified)
      throw badRequest("No pudimos verificar este dispositivo.", "webauthn_failed");
    await sql`
      update devices set sign_count = ${info.authenticationInfo.newCounter}, last_ip = ${clientIp(c)}, last_seen_at = now()
      where user_id = ${user.id}`;
    return c.json({
      device_token: await signDeviceToken(env.DEVICE_TOKEN_SECRET, user.id, d.credential_id),
    });
  });
