import type { AuthAdmin, Mailer } from "../deps.js";
import { uuid } from "../lib/schemas.js";

/**
 * Modo demo (DEMO_MODE=true): el front lista los usuarios de la base (GET /demo/users) y entra
 * como el elegido mandando "Bearer demo:<id>", sin mail ni passkey. Lo que se hace en la app
 * modifica de verdad a ese usuario. Solo para presentaciones: cualquiera puede entrar como cualquiera.
 */
const DEMO_PREFIX = "demo:";

/** Id de usuario de un token demo ("demo:<uuid>"), o null si el token no es demo. */
export function demoUserId(token: string): string | null {
  if (!token.startsWith(DEMO_PREFIX)) return null;
  const parsed = uuid.safeParse(token.slice(DEMO_PREFIX.length));
  return parsed.success ? parsed.data : null;
}

/** En demo no se crean usuarios en Supabase Auth: las cuentas nuevas se eligen en el selector. */
export const demoAuthAdmin: AuthAdmin = {
  createUser: async () => crypto.randomUUID(),
  deleteUser: async () => undefined,
};

/** En demo no sale ningún mail (cualquiera podría cargar direcciones ajenas). */
export const demoMailer: Mailer = {
  send: async (msg) => {
    console.info(`[demo] mail no enviado a ${msg.to}: ${msg.subject}`);
  },
};
