import { z } from "zod";

const list = (s: string) =>
  s
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);

/**
 * Orígenes de WebAuthn: tienen que coincidir exacto con el del navegador, así que los web se
 * normalizan (sin "/" final) y los inválidos frenan el arranque. Los de Android van tal cual.
 */
const webauthnOrigins = (s: string, ctx: z.RefinementCtx) =>
  list(s).map((o) => {
    if (o.startsWith("android:apk-key-hash:")) return o;
    const url = URL.canParse(o) ? new URL(o) : null;
    if (url?.protocol === "https:" || url?.protocol === "http:") return url.origin;
    ctx.addIssue({ code: "custom", message: `"${o}" no es un origen (https://dominio)` });
    return o;
  });

export const envSchema = z
  .object({
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
    /**
     * Orígenes de la app nativa (WebView de Capacitor). Solo a ellos se les entrega el token de
     * dispositivo en el cuerpo y se les acepta en X-Device-Token; la web usa únicamente la cookie.
     */
    NATIVE_ORIGINS: z.string().default("").transform(list),
    WEBAUTHN_RP_ID: z
      .string()
      .trim()
      .toLowerCase()
      .regex(/^[a-z0-9.-]+$/, "solo el dominio, sin https:// ni /"),
    WEBAUTHN_RP_NAME: z.string().default("Cuidarte+"),
    /** Orígenes aceptados para WebAuthn (web y, si aplica, android:apk-key-hash:...). */
    WEBAUTHN_ORIGINS: z.string().min(1).transform(webauthnOrigins),
    SUPABASE_URL: z.string().url(),
    SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
    SMTP_HOST: z.string().min(1),
    SMTP_PORT: z.coerce.number().int().default(465),
    SMTP_USER: z.string().min(1),
    SMTP_PASS: z.string().min(1),
    SMTP_FROM: z.string().default("Cuidarte+ <info@redasistir.online>"),
    GROQ_API_KEY: z.string().min(1),
    GROQ_MODEL: z.string().default("openai/gpt-oss-120b"),
  })
  .superRefine((env, ctx) => {
    // El navegador rechaza una passkey cuyo rpId no es el dominio de la página (o uno padre).
    const rpId = env.WEBAUTHN_RP_ID;
    const web = env.WEBAUTHN_ORIGINS.filter((o) => o.startsWith("http") && URL.canParse(o));
    for (const origin of web) {
      const host = new URL(origin).hostname;
      if (host !== rpId && !host.endsWith(`.${rpId}`)) {
        ctx.addIssue({
          code: "custom",
          path: ["WEBAUTHN_ORIGINS"],
          message: `${origin} no está bajo WEBAUTHN_RP_ID (${rpId})`,
        });
      }
    }
  });

export type Env = z.infer<typeof envSchema>;

export function loadEnv(source: Record<string, string | undefined> = process.env): Env {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const missing = parsed.error.issues.map((i) => `${i.path.join(".")} (${i.message})`).join(", ");
    throw new Error(`Variables de entorno inválidas o faltantes: ${missing}`);
  }
  return parsed.data;
}
