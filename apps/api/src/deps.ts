import type { Env } from "./env.js";
import type { Sql, SqlPool } from "./db.js";
import type { LlmClient } from "./services/llm.js";

export interface TokenVerifier {
  /** Valida el JWT de Supabase y devuelve el id de usuario (sub). */
  verify(token: string): Promise<{ sub: string }>;
}

export interface AuthAdmin {
  /** Crea el usuario en Supabase Auth (sin contraseña; ingresa con código por mail). Devuelve su id. */
  createUser(email: string): Promise<string>;
  deleteUser(id: string): Promise<void>;
}

export interface Mailer {
  send(msg: { to: string; subject: string; text: string }): Promise<void>;
}

export interface Deps {
  env: Env;
  sql: Sql;
  /**
   * Si está, cada pedido toma la conexión de acá (y la devuelve al terminar) en vez de usar `sql`.
   * En Vercel la renueva después de un rato sin uso: ver createRecyclingSql en db.ts.
   */
  sqlPool?: SqlPool;
  verifier: TokenVerifier;
  authAdmin: AuthAdmin;
  mailer: Mailer;
  llm: LlmClient;
  now: () => Date;
}

export type Role = "caregiver" | "admin" | "patient";

export interface AuthUser {
  id: string;
  role: Role;
  /** credential_id del dispositivo registrado, si hay. */
  credentialId: string | null;
}

export type AppEnv = { Variables: { deps: Deps; user: AuthUser } };
