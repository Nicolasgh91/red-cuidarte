import { Hono } from "hono";
import type { AppEnv } from "../deps.js";
import { requireRole } from "../auth/middleware.js";
import { conflict, notFound } from "../errors.js";
import { caregiverProfile } from "../lib/schemas.js";
import { validate } from "../lib/validate.js";
import { listMedications } from "../services/medications.js";

export const me = new Hono<AppEnv>()
  .get("/", async (c) => {
    const { sql } = c.get("deps");
    const user = c.get("user");
    const [profile] =
      user.role === "caregiver"
        ? await sql`select first_name, last_names, phone, email, birth_date from caregivers where user_id = ${user.id}`
        : user.role === "admin"
          ? await sql`select first_name, last_name, email, mobile from admins where user_id = ${user.id}`
          : await sql`select first_name, last_name from patients where user_id = ${user.id}`;
    return c.json({ id: user.id, role: user.role, profile: profile ?? null });
  })
  .put("/profile", requireRole("caregiver"), validate("json", caregiverProfile), async (c) => {
    const { sql } = c.get("deps");
    const id = c.get("user").id;
    const p = c.req.valid("json");
    const taken = await sql`select 1 from users where email = ${p.email} and id <> ${id}`;
    if (taken.length) throw conflict("Ya hay una cuenta con ese mail.", "email_taken");
    await sql.begin(async (tx) => {
      await tx`update caregivers set first_name = ${p.first_name}, last_names = ${p.last_names}, phone = ${p.phone},
               email = ${p.email}, birth_date = ${p.birth_date} where user_id = ${id}`;
      await tx`update users set email = ${p.email} where id = ${id}`;
    });
    return c.json({ ok: true as const });
  })
  .get("/patients", requireRole("caregiver"), async (c) => {
    // Pacientes asignados con su medicación (dato de salud: solo cuidadores asignados y admin).
    const deps = c.get("deps");
    const rows = await deps.sql<{ user_id: string; first_name: string; last_name: string }[]>`
      select p.user_id, p.first_name, p.last_name
      from caregiver_patients cp join patients p on p.user_id = cp.patient_id
      where cp.caregiver_id = ${c.get("user").id} order by p.first_name`;
    const meds = await listMedications(
      deps.sql,
      deps.env.MEDICATIONS_KEY,
      rows.map((r) => r.user_id),
    );
    return c.json({
      patients: rows.map((r) => ({
        id: r.user_id,
        first_name: r.first_name,
        last_name: r.last_name,
        medications: meds
          .filter((m) => m.patient_id === r.user_id)
          .map(({ id, name, dose, times }) => ({ id, name, dose, times })),
      })),
    });
  })
  .delete("/", requireRole("caregiver"), async (c) => {
    // Borra perfil, bienestar, turnos y recordatorios (cascade) y la cuenta de Auth.
    const deps = c.get("deps");
    const id = c.get("user").id;
    const rows = await deps.sql`delete from users where id = ${id} returning id`;
    if (!rows.length) throw notFound();
    await deps.authAdmin.deleteUser(id);
    return c.json({ ok: true as const });
  });
