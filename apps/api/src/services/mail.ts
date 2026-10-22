import type { Deps } from "../deps.js";

export const birthdayMail = (firstName: string) => ({
  subject: `¡Feliz cumpleaños, ${firstName}!`,
  text:
    `Hola, ${firstName}.\n\n` +
    "Hoy queremos cuidarte a vos. Gracias por todo lo que hacés por las personas que acompañás. " +
    "Regalate un momento: en Cuidarte+ tenés una pausa guiada esperándote.\n\n" +
    "Red Cuidar · Cuidamos a quien cuida",
});

/** Registra el envío en mail_log (queda pending → sent/failed). */
export async function sendLogged(
  deps: Deps,
  msg: { to: string; subject: string; text: string },
  kind: "birthday" | "test",
  year: number,
): Promise<"sent" | "failed" | "skipped"> {
  const { sql, mailer } = deps;
  // Cumpleaños: único por (mail, tipo, año). Un envío fallido se puede reintentar; uno enviado o en curso no.
  const [row] = await sql<{ id: string }[]>`
    insert into mail_log (to_email, subject, kind, year, status)
    values (${msg.to}, ${msg.subject}, ${kind}, ${year}, 'pending')
    on conflict (to_email, kind, year) where kind = 'birthday'
    do update set status = 'pending', error = null, sent_at = now() where mail_log.status = 'failed'
    returning id`;
  if (!row) return "skipped";
  try {
    await mailer.send(msg);
    await sql`update mail_log set status = 'sent', sent_at = now() where id = ${row.id}`;
    return "sent";
  } catch (e) {
    await sql`update mail_log set status = 'failed', error = ${String((e as Error).message).slice(0, 300)} where id = ${row.id}`;
    return "failed";
  }
}
