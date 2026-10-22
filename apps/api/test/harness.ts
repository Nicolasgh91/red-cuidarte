import { randomUUID } from "node:crypto";
import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair } from "jose";
import { createApp } from "../src/app.js";
import { signDeviceToken } from "../src/auth/deviceToken.js";
import { createJwtVerifier } from "../src/auth/verifier.js";
import { createSql, type Sql } from "../src/db.js";
import type { AuthAdmin, Deps, Mailer, Role } from "../src/deps.js";
import { loadEnv } from "../src/env.js";
import { encrypt } from "../src/lib/crypto.js";
import type { LlmClient, LlmResult } from "../src/services/llm.js";

export const TEST_ENV = loadEnv({
  DATABASE_URL:
    process.env.TEST_DATABASE_URL ?? "postgres://postgres:postgres@localhost:54329/cuidarte_test",
  MEDICATIONS_KEY: Buffer.alloc(32, 7).toString("base64"),
  DEVICE_TOKEN_SECRET: "test-device-token-secret-0123456789abcdef",
  CRON_SECRET: "test-cron-secret-123",
  ALLOWED_ORIGINS: "https://redasistir.online,capacitor://localhost",
  WEBAUTHN_RP_ID: "redasistir.online",
  WEBAUTHN_ORIGINS: "https://redasistir.online",
  SUPABASE_URL: "https://test.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "service-role-test",
  SMTP_HOST: "smtp.test",
  SMTP_USER: "u",
  SMTP_PASS: "p",
  GROQ_API_KEY: "g",
});

const ISSUER = "https://test.supabase.co/auth/v1";
export const DEFAULT_CREDENTIAL = "test-credential";

export interface Harness {
  sql: Sql;
  deps: Deps;
  app: ReturnType<typeof createApp>;
  sent: { to: string; subject: string; text: string }[];
  llmCalls: { messages: unknown[] }[];
  authCreated: string[];
  authDeleted: string[];
  setNow(d: Date): void;
  setLlm(
    fn: (
      call: number,
      input: Parameters<LlmClient["complete"]>[0],
    ) => LlmResult | Promise<LlmResult>,
  ): void;
  failMail(on: boolean): void;
  reset(): Promise<void>;
  close(): Promise<void>;
  token(sub: string): Promise<string>;
  /** Pedido autenticado. device=false omite el token de dispositivo. */
  req(
    path: string,
    opts?: {
      as?: string;
      method?: string;
      json?: unknown;
      device?: boolean;
      headers?: Record<string, string>;
    },
  ): Promise<Response>;
  // Datos de prueba
  caregiver(
    over?: Partial<{ first_name: string; last_names: string; birth_date: string; email: string }>,
  ): Promise<string>;
  patient(
    over?: Partial<{ first_name: string; last_name: string; email: string | null }>,
  ): Promise<string>;
  admin(): Promise<string>;
  assign(caregiverId: string, patientId: string): Promise<void>;
  medication(patientId: string, name: string, dose: string, times: string[]): Promise<string>;
  shift(
    caregiverId: string,
    patientId: string,
    date: string,
    start: string,
    end: string,
  ): Promise<string>;
  /** Registra un dispositivo "ya vinculado" para el usuario (para poder pasar el control de dispositivo). */
  bindDevice(userId: string, credentialId?: string): Promise<void>;
}

export async function createHarness(): Promise<Harness> {
  const sql = createSql(TEST_ENV.DATABASE_URL, { max: 4, quiet: true });
  const { publicKey, privateKey } = await generateKeyPair("ES256");
  const jwk = { ...(await exportJWK(publicKey)), kid: "test", alg: "ES256", use: "sig" };
  const verifier = createJwtVerifier(createLocalJWKSet({ keys: [jwk] }), ISSUER);

  const sent: Harness["sent"] = [];
  let mailFails = false;
  const mailer: Mailer = {
    async send(m) {
      if (mailFails) throw new Error("SMTP caído");
      sent.push(m);
    },
  };
  const authCreated: string[] = [];
  const authDeleted: string[] = [];
  const authAdmin: AuthAdmin = {
    async createUser(email) {
      authCreated.push(email);
      return randomUUID();
    },
    async deleteUser(id) {
      authDeleted.push(id);
    },
  };
  let now = new Date("2026-10-21T15:00:00Z"); // miércoles 12:00 en Argentina
  const llmCalls: Harness["llmCalls"] = [];
  let llmFn: Parameters<Harness["setLlm"]>[0] = () => ({ content: "Hola.", tool_calls: [] });
  const llm: LlmClient = {
    async complete(input) {
      llmCalls.push({ messages: structuredClone(input.messages) });
      return llmFn(llmCalls.length, input);
    },
  };

  const deps: Deps = { env: TEST_ENV, sql, verifier, authAdmin, mailer, llm, now: () => now };
  const app = createApp(deps);

  const token = (sub: string) =>
    new SignJWT({})
      .setProtectedHeader({ alg: "ES256", kid: "test" })
      .setSubject(sub)
      .setIssuer(ISSUER)
      .setAudience("authenticated")
      .setExpirationTime("1h")
      .sign(privateKey);

  const make = async (role: Role, email: string | null) => {
    const id = randomUUID();
    await sql`insert into users (id, role, email) values (${id}, ${role}, ${email})`;
    return id;
  };
  let n = 0;

  return {
    sql,
    deps,
    app,
    sent,
    llmCalls,
    authCreated,
    authDeleted,
    setNow: (d) => void (now = d),
    setLlm: (fn) => void (llmFn = fn),
    failMail: (on) => void (mailFails = on),
    token,
    async reset() {
      await sql`truncate users, mail_log cascade`;
      sent.length = authCreated.length = authDeleted.length = llmCalls.length = 0;
      mailFails = false;
      now = new Date("2026-10-21T15:00:00Z");
      llmFn = () => ({ content: "Hola.", tool_calls: [] });
    },
    async close() {
      await sql.end();
    },
    async req(path, opts = {}) {
      const headers: Record<string, string> = { ...(opts.headers ?? {}) };
      if (opts.as) {
        headers.Authorization = `Bearer ${await token(opts.as)}`;
        if (opts.device !== false) {
          headers["X-Device-Token"] = await signDeviceToken(
            TEST_ENV.DEVICE_TOKEN_SECRET,
            opts.as,
            DEFAULT_CREDENTIAL + opts.as,
          );
        }
      }
      if (opts.json !== undefined) headers["Content-Type"] = "application/json";
      return app.request(path, {
        method: opts.method ?? (opts.json !== undefined ? "POST" : "GET"),
        headers,
        body: opts.json !== undefined ? JSON.stringify(opts.json) : undefined,
      });
    },
    async caregiver(over = {}) {
      const email = over.email ?? `cg${++n}@example.org`;
      const id = await make("caregiver", email);
      await sql`insert into caregivers (user_id, first_name, last_names, phone, email, birth_date)
                values (${id}, ${over.first_name ?? "Sofía"}, ${over.last_names ?? "Ejemplo"}, '342 155 000000', ${email}, ${over.birth_date ?? "1980-05-14"})`;
      await sql`insert into devices (user_id, credential_id, public_key, label) values (${id}, ${DEFAULT_CREDENTIAL + id}, '\\x00', 'Test')`;
      return id;
    },
    async patient(over = {}) {
      const email = over.email === undefined ? null : over.email;
      const id = await make("patient", email);
      await sql`insert into patients (user_id, first_name, last_name) values (${id}, ${over.first_name ?? "Elena"}, ${over.last_name ?? "Ejemplo"})`;
      if (email)
        await sql`insert into devices (user_id, credential_id, public_key, label) values (${id}, ${DEFAULT_CREDENTIAL + id}, '\\x00', 'Test')`;
      return id;
    },
    async admin() {
      const email = `admin${++n}@example.org`;
      const id = await make("admin", email);
      await sql`insert into admins (user_id, first_name, last_name, email, mobile) values (${id}, 'Jorge', 'Ejemplo', ${email}, '342 155 111111')`;
      await sql`insert into devices (user_id, credential_id, public_key, label) values (${id}, ${DEFAULT_CREDENTIAL + id}, '\\x00', 'Test')`;
      return id;
    },
    async assign(c, p) {
      await sql`insert into caregiver_patients (caregiver_id, patient_id) values (${c}, ${p})`;
    },
    async medication(p, name, dose, times) {
      const [r] = await sql<{ id: string }[]>`
        insert into medications (patient_id, name, dose, times)
        values (${p}, ${encrypt(TEST_ENV.MEDICATIONS_KEY, name)}, ${encrypt(TEST_ENV.MEDICATIONS_KEY, dose)}, ${sql.array(times)}::time[]) returning id`;
      return r!.id;
    },
    async shift(c, p, date, start, end) {
      const [r] = await sql<{ id: string }[]>`
        insert into shifts (caregiver_id, patient_id, date, start_time, end_time) values (${c}, ${p}, ${date}, ${start}, ${end}) returning id`;
      return r!.id;
    },
    async bindDevice(userId, credentialId = DEFAULT_CREDENTIAL + userId) {
      await sql`insert into devices (user_id, credential_id, public_key, label) values (${userId}, ${credentialId}, '\\x00', 'Test')
                on conflict (user_id) do update set credential_id = excluded.credential_id`;
    },
  };
}
