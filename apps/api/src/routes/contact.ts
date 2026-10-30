import { Hono } from "hono";
import type { AppEnv } from "../deps.js";
import { contactMessage } from "../lib/schemas.js";
import { validate } from "../lib/validate.js";
import { sendContact } from "../services/contact.js";

/** Formulario de Contacto: cualquier rol autenticado (con su dispositivo verificado). */
export const contact = new Hono<AppEnv>().post("/", validate("json", contactMessage), async (c) => {
  await sendContact(c.get("deps"), c.get("user"), c.req.valid("json"));
  return c.json({ ok: true as const });
});
