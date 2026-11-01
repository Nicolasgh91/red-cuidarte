import type { Sql } from "../db.js";
import type { AuthUser } from "../deps.js";
import { notFound } from "../errors.js";
import { decrypt, encrypt } from "../lib/crypto.js";
import { hhmm } from "../lib/time.js";
import { assertCanEditPatient } from "./access.js";

export interface Medication {
  id: string;
  name: string;
  dose: string;
  times: string[];
}

/** Medicación de esos pacientes, descifrada y agrupada por paciente. */
export async function listMedications(
  sql: Sql,
  key: string,
  patientIds: string[],
): Promise<Map<string, Medication[]>> {
  const byPatient = new Map<string, Medication[]>(patientIds.map((id) => [id, []]));
  if (!patientIds.length) return byPatient;
  const rows = await sql<
    { id: string; patient_id: string; name: Buffer; dose: Buffer; times: string[] }[]
  >`
    select id, patient_id, name, dose, times::text[] as times
    from medications where patient_id in ${sql(patientIds)}`;
  for (const r of rows) {
    byPatient.get(r.patient_id)?.push({
      id: r.id,
      name: decrypt(key, r.name),
      dose: decrypt(key, r.dose),
      times: r.times.map(hhmm).sort(),
    });
  }
  return byPatient;
}

/** Alta de medicación por el admin o por un cuidador/a asignado a esa persona. */
export async function addMedication(
  sql: Sql,
  key: string,
  user: AuthUser,
  patientId: string,
  m: { name: string; dose: string; times: string[] },
): Promise<Medication> {
  await assertCanEditPatient(sql, user, patientId);
  const times = [...new Set(m.times)].sort();
  const [row] = await sql<{ id: string }[]>`
    insert into medications (patient_id, name, dose, times)
    values (${patientId}, ${encrypt(key, m.name)}, ${encrypt(key, m.dose)}, ${sql.array(times)}::time[])
    returning id`;
  return { id: row!.id, name: m.name, dose: m.dose, times };
}

/** Baja de medicación: el admin, cualquiera; un cuidador/a, solo de sus pacientes asignados. */
export async function removeMedication(sql: Sql, user: AuthUser, id: string): Promise<void> {
  const rows =
    user.role === "admin"
      ? await sql`delete from medications where id = ${id} returning id`
      : await sql`
          delete from medications m using caregiver_patients cp
          where m.id = ${id} and cp.patient_id = m.patient_id and cp.caregiver_id = ${user.id}
          returning m.id`;
  if (!rows.length) throw notFound("No encontramos ese medicamento.");
}
