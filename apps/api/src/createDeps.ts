import { createSupabaseAuthAdmin } from "./auth/authAdmin.js";
import { createSupabaseVerifier } from "./auth/verifier.js";
import { createSql } from "./db.js";
import type { Deps } from "./deps.js";
import { loadEnv } from "./env.js";
import { createGroqClient } from "./services/llm.js";
import { createSmtpMailer } from "./services/mailer.js";

/** Dependencias de producción/desarrollo, desde variables de entorno (ver docs/env.md). */
export function createDeps(source: Record<string, string | undefined> = process.env): Deps {
  const env = loadEnv(source);
  return {
    env,
    sql: createSql(env.DATABASE_URL),
    verifier: createSupabaseVerifier(env.SUPABASE_URL),
    authAdmin: createSupabaseAuthAdmin(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY),
    mailer: createSmtpMailer(env),
    llm: createGroqClient(env.GROQ_API_KEY, env.GROQ_MODEL),
    now: () => new Date(),
  };
}
