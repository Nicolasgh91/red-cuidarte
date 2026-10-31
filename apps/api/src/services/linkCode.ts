import { randomInt } from "node:crypto";
import type { Sql } from "../db.js";
import { HttpError, notFound } from "../errors.js";

/** Sin 0/O ni 1/I/L: el código se dicta o se copia a mano. */
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const LENGTH = 8;
export const LINK_CODE_HOURS = 48;
export const LINK_ATTEMPT_LIMIT = 10;

const newCode = (): string =>
  Array.from({ length: LENGTH }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");

/** Lo que se muestra y se escribe: mayúsculas, sin espacios ni guiones. */
export const normalizeCode = (raw: string): string => raw.toUpperCase().replace(/[^A-Z0-9]/g, "");

/**
 * Código vigente del paciente; si no hay o venció (o se pide `renew`), genera uno nuevo.
 * Vale 48 horas y se usa una sola vez.
 */
export async function linkCodeFor(
  sql: Sql,
  patientId: string,
  now: Date,
  renew = false,
): Promise<{ code: string; expires_at: string }> {
  if (!renew) {
    const [cur] = await sql<{ code: string; expires_at: Date }[]>`
      select link_code as code, link_code_expires_at as expires_at from patients
      where user_id = ${patientId} and link_code is not null and link_code_expires_at > ${now}`;
    if (cur) return { code: cur.code, expires_at: cur.expires_at.toISOString() };
  }
  const expires = new Date(now.getTime() + LINK_CODE_HOURS * 3_600_000);
  for (;;) {
    const code = newCode();
    try {
      await sql`update patients set link_code = ${code}, link_code_expires_at = ${expires}
                where user_id = ${patientId}`;
      return { code, expires_at: expires.toISOString() };
    } catch (e) {
      // Choque con el código de otro paciente (unique): se prueba con otro.
      if ((e as { code?: string }).code !== "23505") throw e;
    }
  }
}

/**
 * El cuidador/a canjea un código: queda asignado al paciente y el código se consume.
 * Limita los intentos por hora para que no se pueda adivinar.
 */
export async function redeemLinkCode(
  sql: Sql,
  caregiverId: string,
  rawCode: string,
  now: Date,
): Promise<string> {
  const code = normalizeCode(rawCode);
  const since = new Date(now.getTime() - 3_600_000);
  // El intento se confirma antes de buscar el código: si fallara dentro de la misma transacción,
  // se revertiría y el límite no contaría los códigos inválidos.
  await sql.begin(async (tx) => {
    await tx`select pg_advisory_xact_lock(hashtext(${"link:" + caregiverId}))`;
    const [counted] = await tx<{ n: number }[]>`
      select count(*)::int as n from link_attempts
      where caregiver_id = ${caregiverId} and at > ${since}`;
    if ((counted?.n ?? 0) >= LINK_ATTEMPT_LIMIT) {
      throw new HttpError(
        429,
        "rate_limited",
        "Hubo muchos intentos seguidos. Probá de nuevo en una hora.",
      );
    }
    await tx`insert into link_attempts (caregiver_id, at) values (${caregiverId}, ${now})`;
  });
  return sql.begin(async (tx) => {
    const [p] = await tx<{ user_id: string }[]>`
      select user_id from patients
      where link_code = ${code} and link_code_expires_at > ${now}
      for update`;
    if (!p) throw notFound("Ese código no existe o ya venció. Pedile a la persona uno nuevo.");
    await tx`insert into caregiver_patients (caregiver_id, patient_id)
             values (${caregiverId}, ${p.user_id}) on conflict do nothing`;
    await tx`update patients set link_code = null, link_code_expires_at = null
             where user_id = ${p.user_id}`;
    return p.user_id;
  });
}
