import type { Deps } from "../deps.js";
import { MailError, type MailFailureKind } from "./mailer.js";

export const birthdayMail = (firstName: string) => ({
  subject: `¡Feliz cumpleaños, ${firstName}!`,
  text:
    `Hola, ${firstName}.\n\n` +
    "Hoy queremos cuidarte a vos. Gracias por todo lo que hacés por las personas que acompañás. " +
    "Regalate un momento: en Cuidarte+ tenés una pausa guiada esperándote.\n\n" +
    "Red Cuidar · Cuidamos a quien cuida",
});

/** Dirección de un remitente/destino con formato "Nombre <dir>" (o la misma cadena si no lo tiene). */
export const addressOf = (s: string): string => /<([^>]+)>/.exec(s)?.[1] ?? s;

/** Qué le decimos al admin (Correos) según el tipo de falla: dice qué revisar. */
export const ADMIN_MAIL_MESSAGE: Record<MailFailureKind, string> = {
  dns: "No se pudo encontrar el servidor de correo. Revisá SMTP_HOST en las variables de Vercel.",
  connect: "No se pudo conectar con el servidor de correo. Revisá SMTP_HOST y SMTP_PORT.",
  timeout: "El servidor de correo tardó demasiado en responder. Probá de nuevo en un rato.",
  tls: "Falló la conexión segura con el servidor de correo. Revisá SMTP_PORT (465 o 587).",
  auth: "El servidor de correo rechazó el usuario o la contraseña. Revisá SMTP_USER y SMTP_PASS.",
  rejected: "El servidor de correo rechazó el mensaje. Revisá la dirección de destino y SMTP_FROM.",
  unknown: "No se pudo enviar el mail. El detalle está en el historial y en los logs de Vercel.",
};

/** Fallas de configuración: reintentar no sirve hasta que alguien cambie una variable. */
export const isMailConfigFailure = (kind: MailFailureKind) =>
  kind === "dns" || kind === "tls" || kind === "auth";

export interface SendResult {
  status: "sent" | "failed" | "skipped";
  /** Solo si status es "failed". */
  failure?: MailError;
}

/**
 * Registra el envío en mail_log (queda pending → sent/failed).
 * logSubject reemplaza el asunto en el registro (los asuntos que escribe un usuario no se copian).
 */
export async function sendLogged(
  deps: Deps,
  msg: { to: string; subject: string; text: string; replyTo?: string },
  kind: "birthday" | "test" | "contact",
  year: number,
  opts: { logSubject?: string } = {},
): Promise<SendResult> {
  const { sql, mailer } = deps;
  // Cumpleaños: único por (mail, tipo, año). Un envío fallido se puede reintentar; uno enviado o en curso no.
  const [row] = await sql<{ id: string }[]>`
    insert into mail_log (to_email, subject, kind, year, status)
    values (${addressOf(msg.to)}, ${opts.logSubject ?? msg.subject}, ${kind}, ${year}, 'pending')
    on conflict (to_email, kind, year) where kind = 'birthday'
    do update set status = 'pending', error = null, sent_at = now() where mail_log.status = 'failed'
    returning id`;
  if (!row) return { status: "skipped" };
  try {
    await mailer.send(msg);
    await sql`update mail_log set status = 'sent', sent_at = now() where id = ${row.id}`;
    return { status: "sent" };
  } catch (e) {
    // El mailer SMTP ya clasifica; cualquier otro error entra como desconocido con su mensaje.
    const failure =
      e instanceof MailError ? e : new MailError("unknown", String((e as Error).message));
    await sql`update mail_log set status = 'failed', error = ${failure.message.slice(0, 300)} where id = ${row.id}`;
    return { status: "failed", failure };
  }
}
