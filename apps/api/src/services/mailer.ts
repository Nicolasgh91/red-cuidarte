import nodemailer from "nodemailer";
import type { Env } from "../env.js";
import type { Mailer } from "../deps.js";

/** Por qué falló el SMTP; de eso depende qué hay que tocar y si vale la pena reintentar. */
export type MailFailureKind =
  "dns" | "connect" | "timeout" | "tls" | "auth" | "rejected" | "unknown";

/** Falla del SMTP ya clasificada. `message` es el detalle técnico que queda en mail_log. */
export class MailError extends Error {
  constructor(
    public kind: MailFailureKind,
    message: string,
    public code?: string,
  ) {
    super(message);
    this.name = "MailError";
  }
}

const DNS = new Set(["ENOTFOUND", "EAI_AGAIN", "EBUSY", "EDNS"]);
const CONNECT = new Set(["ECONNREFUSED", "ECONNRESET", "ESOCKET", "EHOSTUNREACH", "ENETUNREACH"]);
const TIMEOUT = new Set(["ETIMEDOUT", "ECONNECTION"]);
/** Fallas pasajeras del lookup o del socket: un segundo intento suele salir bien. */
const TRANSIENT = new Set(["EBUSY", "EAI_AGAIN", "ETIMEDOUT"]);

/** Ordena el error de nodemailer/Node por su `code` (o, si viene de la respuesta SMTP, por su número). */
export function classifyMailError(e: unknown, host: string): MailError {
  const err = e as { code?: string; responseCode?: number; message?: string };
  const code = err?.code;
  const raw = String(err?.message ?? e).slice(0, 200);
  if (code && DNS.has(code))
    return new MailError(
      "dns",
      `dns: no se pudo resolver «${host}» (revisá SMTP_HOST) [${code}]`,
      code,
    );
  if (code && TIMEOUT.has(code))
    return new MailError("timeout", `timeout: ${host} no respondió a tiempo [${code}]`, code);
  if (code && CONNECT.has(code))
    return new MailError(
      "connect",
      `connect: no se pudo conectar con ${host} (revisá SMTP_PORT) [${code}]`,
      code,
    );
  if (code === "EAUTH" || err?.responseCode === 535)
    return new MailError("auth", "auth: el servidor rechazó SMTP_USER o SMTP_PASS", code);
  if (code === "ESTREAM" || /\b(tls|ssl|certificate|wrong version number)\b/i.test(raw))
    return new MailError(
      "tls",
      `tls: falló el cifrado con ${host} (revisá SMTP_PORT: 465 directo, 587 STARTTLS)`,
      code,
    );
  if (code === "EENVELOPE" || (err?.responseCode !== undefined && err.responseCode >= 500))
    return new MailError("rejected", `rejected: el servidor rechazó el mensaje (${raw})`, code);
  return new MailError("unknown", raw, code);
}

/** Dependencia mínima de nodemailer, para poder probar el mailer sin red. */
export interface MailTransport {
  sendMail(msg: {
    from: string;
    to: string;
    subject: string;
    text: string;
    replyTo?: string;
  }): Promise<unknown>;
}

/** SMTP de la casilla info@ en DonWeb. 465 = TLS directo; 587 = STARTTLS. */
export function createSmtpMailer(
  env: Env,
  transport: MailTransport = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_PORT === 465,
    requireTLS: env.SMTP_PORT !== 465,
    auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  }),
  retryAfterMs = 500,
): Mailer {
  return {
    async send({ to, subject, text, replyTo }) {
      const msg = { from: env.SMTP_FROM, to, subject, text, replyTo };
      try {
        try {
          await transport.sendMail(msg);
        } catch (e) {
          const code = (e as { code?: string }).code;
          if (!code || !TRANSIENT.has(code)) throw e;
          await new Promise((r) => setTimeout(r, retryAfterMs));
          await transport.sendMail(msg);
        }
      } catch (e) {
        const failure = classifyMailError(e, env.SMTP_HOST);
        // La causa real (host, puerto, código) tiene que quedar en los logs; nunca el mensaje ni la clave.
        console.error("mail", {
          kind: failure.kind,
          code: failure.code,
          host: env.SMTP_HOST,
          port: env.SMTP_PORT,
          message: String((e as Error)?.message).slice(0, 200),
        });
        throw failure;
      }
    },
  };
}
