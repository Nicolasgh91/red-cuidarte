import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../deps.js";
import { requireRole } from "../auth/middleware.js";
import { conflict, notFound } from "../errors.js";
import { caregiverProfile, linkCode, newMedication, newPatient, uuid } from "../lib/schemas.js";
import { validate } from "../lib/validate.js";
import { addMedication, listMedications } from "../services/medications.js";
import { redeemLinkCode } from "../services/linkCode.js";
import { createPatient } from "../services/patients.js";

const idParam = z.object({ id: uuid });

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
  .post("/patients", requireRole("caregiver"), validate("json", newPatient), async (c) => {
    // El cuidador/a da de alta a su paciente y queda asignado a él/ella. No puede asignarse
    // pacientes existentes: eso lo hace el admin.
    const id = await createPatient(c.get("deps"), c.req.valid("json"), {
      caregiverId: c.get("user").id,
    });
    return c.json({ id }, 201);
  })
  .post("/patients/link", requireRole("caregiver"), validate("json", linkCode), async (c) => {
    // El paciente le pasó su código: queda asignado a este cuidador/a.
    const { sql, now } = c.get("deps");
    const id = await redeemLinkCode(sql, c.get("user").id, c.req.valid("json").code, now());
    return c.json({ id }, 201);
  })
  .post(
    "/patients/:id/medications",
    requireRole("caregiver"),
    validate("param", idParam),
    validate("json", newMedication),
    async (c) => {
      // Solo para pacientes asignados a este cuidador/a: es un dato de salud.
      const { sql, env } = c.get("deps");
      const { id } = c.req.valid("param");
      const mine = await sql`
        select 1 from caregiver_patients where caregiver_id = ${c.get("user").id} and patient_id = ${id}`;
      if (!mine.length) throw notFound("No encontramos a esa persona.");
      const med = await addMedication(sql, env.MEDICATIONS_KEY, id, c.req.valid("json"));
      return c.json({ id: med.id, name: med.name, dose: med.dose, times: med.times }, 201);
    },
  )
  .delete("/medications/:id", requireRole("caregiver"), validate("param", idParam), async (c) => {
    const rows = await c.get("deps").sql`
      delete from medications m using caregiver_patients cp
      where m.id = ${c.req.valid("param").id} and cp.patient_id = m.patient_id
        and cp.caregiver_id = ${c.get("user").id}
      returning m.id`;
    if (!rows.length) throw notFound("No encontramos ese medicamento.");
    return c.json({ ok: true as const });
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
