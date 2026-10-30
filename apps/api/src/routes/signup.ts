import { Hono } from "hono";
import type { AppEnv } from "../deps.js";
import { HttpError, notFound } from "../errors.js";
import { clientIp } from "../lib/clientIp.js";
import { signup as signupBody } from "../lib/schemas.js";
import { validate } from "../lib/validate.js";
import { createCaregiver } from "../services/caregivers.js";

export const SIGNUP_LIMIT = 5;

/**
 * Autorregistro público de cuidadores/as: crea la cuenta con contraseña y sin pacientes (los asigna
 * el admin). Después el front inicia sesión con Supabase y registra el dispositivo como siempre.
 * Al ser público, se limita por IP: el lock evita que pedidos simultáneos salteen la cuenta.
 */
export const signup = new Hono<AppEnv>().post("/", validate("json", signupBody), async (c) => {
  const deps = c.get("deps");
  if (deps.env.DEMO_MODE) throw notFound("No encontramos esa ruta.");
  const { password, ...profile } = c.req.valid("json");
  const ip = clientIp(c) ?? "desconocida";

  await deps.sql.begin(async (tx) => {
    await tx`select pg_advisory_xact_lock(hashtext(${"signup:" + ip}))`;
    const [counted] = await tx<{ n: number }[]>`
      select count(*)::int as n from signup_attempts
      where ip = ${ip} and at > now() - interval '1 hour'`;
    if ((counted?.n ?? 0) >= SIGNUP_LIMIT) {
      throw new HttpError(
        429,
        "rate_limited",
        "Hubo muchos registros seguidos desde esta conexión. Probá de nuevo en una hora.",
      );
    }
    await tx`insert into signup_attempts (ip) values (${ip})`;
  });

  const id = await createCaregiver(deps, profile, password);
  return c.json({ id }, 201);
});
