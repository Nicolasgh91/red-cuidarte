import type { Sql } from "../db.js";
import type { AuthUser } from "../deps.js";
import { forbidden, notFound } from "../errors.js";

export async function assertAssigned(
  sql: Sql,
  caregiverId: string,
  patientId: string,
): Promise<void> {
  const [row] =
    await sql`select 1 from caregiver_patients where caregiver_id = ${caregiverId} and patient_id = ${patientId}`;
  if (!row) throw forbidden("Esa persona no está asignada a tu cuenta.", "patient_not_assigned");
}

/**
 * Datos de salud de un paciente (medicación): el admin puede editar los de cualquiera; un
 * cuidador/a, solo los de sus pacientes asignados. Si no, 404 (no revela si la persona existe).
 */
export async function assertCanEditPatient(
  sql: Sql,
  user: AuthUser,
  patientId: string,
): Promise<void> {
  const [row] =
    user.role === "admin"
      ? await sql`select 1 from patients where user_id = ${patientId}`
      : await sql`select 1 from caregiver_patients where caregiver_id = ${user.id} and patient_id = ${patientId}`;
  if (!row) throw notFound("No encontramos a esa persona.");
}
