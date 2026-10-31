import type { z } from "zod";
import type { Deps } from "../deps.js";
import { conflict } from "../errors.js";
import type { newPatient } from "../lib/schemas.js";

export type NewPatient = z.output<typeof newPatient>;

/**
 * Alta de un paciente: usuario de Supabase Auth, fila en users y ficha. La usan el admin (sin
 * contraseña; el mail es opcional), el autorregistro (con mail y contraseña) y un cuidador/a que
 * da de alta a su paciente (`caregiverId`: queda asignado en la misma transacción). Sin mail no hay
 * usuario de Auth: es solo una ficha (id propio, sin ingreso). Si falla la base se borra el usuario
 * de Auth para no dejarlo huérfano.
 */
export async function createPatient(
  { sql, authAdmin }: Pick<Deps, "sql" | "authAdmin">,
  b: NewPatient,
  { password, caregiverId }: { password?: string; caregiverId?: string } = {},
): Promise<string> {
  if (b.email && (await sql`select 1 from users where email = ${b.email}`).length)
    throw conflict("Ya hay una cuenta con ese mail.", "email_taken");
  const id = b.email ? await authAdmin.createUser(b.email, password) : crypto.randomUUID();
  try {
    await sql.begin(async (tx) => {
      await tx`insert into users (id, role, email) values (${id}, 'patient', ${b.email ?? null})`;
      await tx`insert into patients (user_id, first_name, last_name) values (${id}, ${b.first_name}, ${b.last_name})`;
      if (caregiverId) {
        await tx`insert into caregiver_patients (caregiver_id, patient_id) values (${caregiverId}, ${id})`;
      }
    });
  } catch (e) {
    if (b.email) await authAdmin.deleteUser(id).catch(() => undefined);
    throw e;
  }
  return id;
}
