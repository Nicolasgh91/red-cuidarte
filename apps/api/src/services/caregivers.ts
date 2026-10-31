import type { z } from "zod";
import type { Deps } from "../deps.js";
import { conflict } from "../errors.js";
import type { caregiverProfile } from "../lib/schemas.js";

/**
 * Sale del mismo esquema que validan las rutas: así el tipo coincide aunque se compile sin
 * `strict` (el build de Vercel no lee el tsconfig base y Zod infiere distinto).
 */
export type NewCaregiver = z.output<typeof caregiverProfile> & { patient_ids?: string[] };

/**
 * Alta de un cuidador/a: usuario de Supabase Auth, fila en users, ficha y asignaciones.
 * La usan el admin (sin contraseña) y el autorregistro (con contraseña, sin pacientes).
 * Si falla la base se borra el usuario de Auth para no dejarlo huérfano.
 */
export async function createCaregiver(
  { sql, authAdmin }: Pick<Deps, "sql" | "authAdmin">,
  b: NewCaregiver,
  password?: string,
): Promise<string> {
  const patientIds = [...new Set(b.patient_ids ?? [])];
  if ((await sql`select 1 from users where email = ${b.email}`).length)
    throw conflict("Ya hay una cuenta con ese mail.", "email_taken");
  if (patientIds.length) {
    const found = await sql`select user_id from patients where user_id in ${sql(patientIds)}`;
    if (found.length !== patientIds.length)
      throw conflict("Alguno de los pacientes elegidos no existe.", "unknown_patient");
  }
  const id = await authAdmin.createUser(b.email, password);
  try {
    await sql.begin(async (tx) => {
      await tx`insert into users (id, role, email) values (${id}, 'caregiver', ${b.email})`;
      await tx`insert into caregivers (user_id, first_name, last_names, phone, email, birth_date)
               values (${id}, ${b.first_name}, ${b.last_names}, ${b.phone}, ${b.email}, ${b.birth_date})`;
      for (const pid of patientIds) {
        await tx`insert into caregiver_patients (caregiver_id, patient_id) values (${id}, ${pid})`;
      }
    });
  } catch (e) {
    await authAdmin.deleteUser(id).catch(() => undefined);
    throw e;
  }
  return id;
}
