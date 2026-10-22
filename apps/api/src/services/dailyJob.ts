import type { Deps } from "../deps.js";
import { nowAR } from "../lib/time.js";
import { birthdayMail, sendLogged } from "./mail.js";

const isLeap = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;

/**
 * Tarea diaria (Vercel Cron, 12:00 UTC = 09:00 en Argentina, con precisión de hora en Hobby):
 *  1. mails de cumpleaños, idempotentes por (mail, tipo, año) vía mail_log;
 *  2. una consulta mínima para que Supabase no pause el proyecto por inactividad.
 */
export async function runDailyJob(deps: Deps) {
  const { sql, now } = deps;
  await sql`select 1`;
  const t = nowAR(now());
  // Quienes nacieron un 29/2 se saludan el 28/2 en los años no bisiestos.
  const feb29Today = t.month === 2 && t.day === 28 && !isLeap(t.year);
  const rows = await sql<{ first_name: string; email: string }[]>`
    select first_name, email from caregivers
    where (extract(month from birth_date) = ${t.month} and extract(day from birth_date) = ${t.day})
       or (${feb29Today} and extract(month from birth_date) = 2 and extract(day from birth_date) = 29)`;
  const result = { date: t.date, birthdays: rows.length, sent: 0, skipped: 0, failed: 0 };
  for (const r of rows) {
    const status = await sendLogged(
      deps,
      { to: r.email, ...birthdayMail(r.first_name) },
      "birthday",
      t.year,
    );
    result[status === "sent" ? "sent" : status === "skipped" ? "skipped" : "failed"]++;
  }
  return result;
}
