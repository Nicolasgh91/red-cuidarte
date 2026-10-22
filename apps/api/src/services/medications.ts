import type { Sql } from "../db.js";
import { decrypt, encrypt } from "../lib/crypto.js";
import { hhmm } from "../lib/time.js";

export interface Medication {
  id: string;
  patient_id: string;
  name: string;
  dose: string;
  times: string[];
}

export async function listMedications(
  sql: Sql,
  key: string,
  patientIds: string[],
): Promise<Medication[]> {
  if (!patientIds.length) return [];
  const rows = await sql<
    { id: string; patient_id: string; name: Buffer; dose: Buffer; times: string[] }[]
  >`
    select id, patient_id, name, dose, times::text[] as times
    from medications where patient_id in ${sql(patientIds)}`;
  return rows.map((r) => ({
    id: r.id,
    patient_id: r.patient_id,
    name: decrypt(key, r.name),
    dose: decrypt(key, r.dose),
    times: r.times.map(hhmm).sort(),
  }));
}

export async function addMedication(
  sql: Sql,
  key: string,
  patientId: string,
  m: { name: string; dose: string; times: string[] },
): Promise<Medication> {
  const times = [...new Set(m.times)].sort();
  const [row] = await sql<{ id: string }[]>`
    insert into medications (patient_id, name, dose, times)
    values (${patientId}, ${encrypt(key, m.name)}, ${encrypt(key, m.dose)}, ${sql.array(times)}::time[])
    returning id`;
  return { id: row!.id, patient_id: patientId, name: m.name, dose: m.dose, times };
}
