import type { Sql } from "../db.js";
import { forbidden } from "../errors.js";

export async function assertAssigned(
  sql: Sql,
  caregiverId: string,
  patientId: string,
): Promise<void> {
  const [row] =
    await sql`select 1 from caregiver_patients where caregiver_id = ${caregiverId} and patient_id = ${patientId}`;
  if (!row) throw forbidden("Esa persona no está asignada a tu cuenta.", "patient_not_assigned");
}
