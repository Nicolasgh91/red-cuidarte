import { z } from "zod";

const list = (s: string) =>
  s
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);

export const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  /** 32 bytes en base64 (AES-256-GCM para medications). */
  MEDICATIONS_KEY: z
    .string()
    .refine(
      (s) => Buffer.from(s, "base64").length === 32,
      "MEDICATIONS_KEY debe ser 32 bytes en base64",
    ),
  DEVICE_TOKEN_SECRET: z.string().min(32),
  CRON_SECRET: z.string().min(16),
  ALLOWED_ORIGINS: z.string().default("").transform(list),
  WEBAUTHN_RP_ID: z.string().min(1),
  WEBAUTHN_RP_NAME: z.string().default("Cuidarte+"),
  /** Orígenes aceptados para WebAuthn (web y, si aplica, android:apk-key-hash:...). */
  WEBAUTHN_ORIGINS: z.string().min(1).transform(list),
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  SMTP_HOST: z.string().min(1),
  SMTP_PORT: z.coerce.number().int().default(465),
  SMTP_USER: z.string().min(1),
  SMTP_PASS: z.string().min(1),
  SMTP_FROM: z.string().default("Cuidarte+ <avisos@redasistir.online>"),
  GROQ_API_KEY: z.string().min(1),
  GROQ_MODEL: z.string().default("openai/gpt-oss-120b"),
  /**
   * Modo demo (solo para presentaciones, nunca con datos reales): se entra sin mail ni passkey
   * con cuentas de ejemplo, y no se mandan mails ni se crean usuarios en Supabase Auth.
   */
  DEMO_MODE: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
});

export type Env = z.infer<typeof envSchema>;

export function loadEnv(source: Record<string, string | undefined> = process.env): Env {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const missing = parsed.error.issues.map((i) => i.path.join(".")).join(", ");
    throw new Error(`Variables de entorno inválidas o faltantes: ${missing}`);
  }
  return parsed.data;
}
