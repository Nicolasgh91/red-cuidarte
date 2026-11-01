import { Hono } from "hono";
import type { AppEnv } from "../deps.js";
import { clientIp } from "../lib/clientIp.js";
import { hit } from "../lib/rateLimit.js";
import { signup as signupBody } from "../lib/schemas.js";
import { validate } from "../lib/validate.js";
import { createCaregiver, createPatient } from "../services/accounts.js";

export const SIGNUP_LIMIT = 5;

/**
 * Autorregistro público de cuidadores/as y pacientes: crea la cuenta con contraseña. Un cuidador
 * no tiene pacientes y un paciente no tiene cuidadores hasta que los asigna el admin. Después el
 * front inicia sesión con Supabase y registra el dispositivo como siempre.
 * Al ser público, se limita por IP.
 */
export const signup = new Hono<AppEnv>().post("/", validate("json", signupBody), async (c) => {
  const deps = c.get("deps");
  const body = c.req.valid("json");
  const ip = clientIp(c) ?? "desconocida";

  await hit(deps.sql, `signup:${ip}`, {
    limit: SIGNUP_LIMIT,
    windowMs: 3_600_000,
    now: deps.now(),
    message: "Hubo muchos registros seguidos desde esta conexión. Probá de nuevo en una hora.",
  });

  const id =
    body.role === "caregiver"
      ? await createCaregiver(deps, body, body.password)
      : await createPatient(deps, body, { password: body.password });
  return c.json({ id }, 201);
});
