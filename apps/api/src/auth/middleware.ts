import type { Context } from "hono";
import { createMiddleware } from "hono/factory";
import type { AppEnv, Role } from "../deps.js";
import { forbidden, unauthorized } from "../errors.js";
import { readDeviceCookie, verifyDeviceToken } from "./deviceToken.js";

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
    if (!token) throw unauthorized("Tenés que iniciar sesión para continuar.", "no_session");

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

const ROLE_PLURAL: Record<Role, string> = {
  caregiver: "cuidadores/as",
  patient: "pacientes",
  admin: "administradores/as",
};

export const requireRole = (...roles: Role[]) =>
  createMiddleware<AppEnv>(async (c, next) => {
    if (!roles.includes(c.get("user").role))
      throw forbidden(
        `Esta parte es solo para ${roles.map((r) => ROLE_PLURAL[r]).join(" y ")}.`,
        "wrong_role",
      );
    await next();
  });
