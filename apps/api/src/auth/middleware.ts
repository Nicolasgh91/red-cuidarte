import type { Context } from "hono";
import { createMiddleware } from "hono/factory";
import type { AppEnv, Role } from "../deps.js";
import { forbidden, unauthorized } from "../errors.js";
import { readDeviceCookie, verifyDeviceToken } from "./deviceToken.js";

const REAUTH_TTL_MS = 5 * 60_000;

/** El pedido viene de la app nativa (Capacitor). Lo decide el navegador; no prueba identidad. */
export const isNativeOrigin = (c: Context<AppEnv>) =>
  c.get("deps").env.NATIVE_ORIGINS.includes(c.req.header("Origin") ?? "");

/**
 * Token de dispositivo vigente para el usuario autenticado: tiene que ser suyo y de la passkey
 * registrada. La web lo manda solo en la cookie; X-Device-Token se acepta solo desde la app nativa.
 */
export async function hasValidDeviceToken(c: Context<AppEnv>): Promise<boolean> {
  const user = c.get("user");
  if (!user.credentialId) return false;
  const token =
    readDeviceCookie(c) ?? (isNativeOrigin(c) ? c.req.header("X-Device-Token") : undefined);
  const claims = token
    ? await verifyDeviceToken(c.get("deps").env.DEVICE_TOKEN_SECRET, token)
    : null;
  return !!claims && claims.sub === user.id && claims.cid === user.credentialId;
}

/**
 * Valida el JWT de Supabase y toma el rol de la tabla users.
 * Con requireDevice exige además el token de dispositivo (passkey verificada) y que la
 * credencial siga siendo la registrada: al restablecer la passkey, el token deja de servir.
 */
export const authenticate = (opts: { requireDevice: boolean }) =>
  createMiddleware<AppEnv>(async (c, next) => {
    const deps = c.get("deps");
    const header = c.req.header("Authorization") ?? "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : "";
    if (!token) throw unauthorized();

    const { sub } = await deps.verifier.verify(token);

    const [row] = await deps.sql<{ role: Role; credential_id: string | null }[]>`
      select u.role, d.credential_id
      from users u left join devices d on d.user_id = u.id
      where u.id = ${sub}`;
    if (!row)
      throw forbidden(
        "Tu cuenta todavía no está dada de alta. Pedile al administrador que la cargue.",
        "not_registered",
      );
    c.set("user", { id: sub, role: row.role, credentialId: row.credential_id });

    if (opts.requireDevice) {
      if (!row.credential_id) {
        throw forbidden("Falta registrar tu passkey.", "device_unregistered");
      }
      if (!(await hasValidDeviceToken(c))) {
        throw forbidden("Verificá tu passkey para continuar.", "device_login_required");
      }
    }
    await next();
  });

export const requireRole = (...roles: Role[]) =>
  createMiddleware<AppEnv>(async (c, next) => {
    if (!roles.includes(c.get("user").role)) throw forbidden();
    await next();
  });

/**
 * Acciones sensibles: exige una reautenticación con passkey (POST /device/reauth/verify) de
 * hace menos de 5 minutos y la consume, así cada acción pide una prueba nueva.
 */
export const requireRecentPasskey = () =>
  createMiddleware<AppEnv>(async (c, next) => {
    const { sql, now } = c.get("deps");
    const rows = await sql`
      update devices set reauth_at = null
      where user_id = ${c.get("user").id} and reauth_at > ${new Date(now().getTime() - REAUTH_TTL_MS)}
      returning user_id`;
    if (!rows.length) throw forbidden("Confirmá con tu passkey para continuar.", "reauth_required");
    await next();
  });
