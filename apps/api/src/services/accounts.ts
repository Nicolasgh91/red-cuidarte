import type { z } from "zod";
import type { Tx } from "../db.js";
import type { Deps, Role } from "../deps.js";
import { conflict } from "../errors.js";
import type { caregiverProfile, newPatient } from "../lib/schemas.js";

/**
 * Salen de los mismos esquemas que validan las rutas: así el tipo coincide aunque se compile sin
 * `strict` (el build de Vercel no lee el tsconfig base y Zod infiere distinto).
 */
export type NewCaregiver = z.output<typeof caregiverProfile> & { patient_ids?: string[] };
export type NewPatient = z.output<typeof newPatient>;

type AccountDeps = Pick<Deps, "sql" | "authAdmin">;

/**
 * Alta de una cuenta: usuario de Supabase Auth (si hay mail), fila en users y lo que agregue
 * `insertProfile`, todo en una transacción. Sin mail no hay usuario de Auth: es solo una ficha con
 * id propio. Si falla la base se borra el usuario de Auth para no dejarlo huérfano.
 */
async function createAccount(
  { sql, authAdmin }: AccountDeps,
  role: Role,
  email: string | undefined,
  password: string | undefined,
  insertProfile: (tx: Tx, id: string) => Promise<void>,
): Promise<string> {
  if (email && (await sql`select 1 from users where email = ${email}`).length)
    throw conflict("Ya hay una cuenta con ese mail.", "email_taken");
  const id = email ? await authAdmin.createUser(email, password) : crypto.randomUUID();
  try {
    await sql.begin(async (tx) => {
      await tx`insert into users (id, role, email) values (${id}, ${role}, ${email ?? null})`;
      await insertProfile(tx, id);
    });
  } catch (e) {
    if (email) await authAdmin.deleteUser(id).catch(() => undefined);
    throw e;
  }
  return id;
}

/**
 * Cuidador/a con sus asignaciones. La usan el admin (sin contraseña: la define en su primer
 * ingreso con un código por mail) y el autorregistro (con contraseña, sin pacientes).
 */
export async function createCaregiver(
  deps: AccountDeps,
  b: NewCaregiver,
  password?: string,
): Promise<string> {
  const patientIds = [...new Set(b.patient_ids ?? [])];
  if (patientIds.length) {
    const found =
      await deps.sql`select user_id from patients where user_id in ${deps.sql(patientIds)}`;
    if (found.length !== patientIds.length)
      throw conflict("Alguno de los pacientes elegidos no existe.", "unknown_patient");
  }
  return createAccount(deps, "caregiver", b.email, password, async (tx, id) => {
    await tx`insert into caregivers (user_id, first_name, last_names, phone, email, birth_date)
             values (${id}, ${b.first_name}, ${b.last_names}, ${b.phone}, ${b.email}, ${b.birth_date})`;
    for (const pid of patientIds) {
      await tx`insert into caregiver_patients (caregiver_id, patient_id) values (${id}, ${pid})`;
    }
  });
}

/**
 * Paciente. La usan el admin (sin contraseña; el mail es opcional), el autorregistro (con mail y
 * contraseña) y un cuidador/a que da de alta a su paciente (`caregiverId`: queda asignado en la
 * misma transacción).
 */
export async function createPatient(
  deps: AccountDeps,
  b: NewPatient,
  { password, caregiverId }: { password?: string; caregiverId?: string } = {},
): Promise<string> {
  return createAccount(deps, "patient", b.email, password, async (tx, id) => {
    await tx`insert into patients (user_id, first_name, last_name) values (${id}, ${b.first_name}, ${b.last_name})`;
    if (caregiverId) {
      await tx`insert into caregiver_patients (caregiver_id, patient_id) values (${caregiverId}, ${id})`;
    }
  });
}
