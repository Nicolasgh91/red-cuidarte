import { createMiddleware } from "hono/factory";
import type { AppEnv, Role } from "../deps.js";
import { forbidden, unauthorized } from "../errors.js";
import { verifyDeviceToken } from "./deviceToken.js";

/**
 * Valida el JWT de Supabase y toma el rol de la tabla users.
 * Con requireDevice exige además el token de dispositivo (passkey verificada) y que la
 * credencial siga siendo la registrada: al "Liberar" el dispositivo, el token deja de servir.
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
    const user = { id: sub, role: row.role, credentialId: row.credential_id };
    c.set("user", user);

    if (opts.requireDevice) {
      if (!user.credentialId) {
        throw forbidden("Falta registrar este dispositivo.", "device_unregistered");
      }
      const dt = c.req.header("X-Device-Token");
      const claims = dt ? await verifyDeviceToken(deps.env.DEVICE_TOKEN_SECRET, dt) : null;
      if (!claims || claims.sub !== user.id || claims.cid !== user.credentialId) {
        throw forbidden("Verificá tu dispositivo para continuar.", "device_login_required");
      }
    }
    await next();
  });

export const requireRole = (...roles: Role[]) =>
  createMiddleware<AppEnv>(async (c, next) => {
    if (!roles.includes(c.get("user").role)) throw forbidden();
    await next();
  });
