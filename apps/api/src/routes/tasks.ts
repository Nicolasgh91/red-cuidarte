import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../deps.js";
import { notFound } from "../errors.js";
import { hhmmTime, isoDate, uuid } from "../lib/schemas.js";
import { validate } from "../lib/validate.js";
import { assertAssigned } from "../services/access.js";
import { listMedications } from "../services/medications.js";
import { assertTaskKey, checklist } from "../services/tasks.js";

export const tasks = new Hono<AppEnv>()
  .get("/", validate("query", z.object({ date: isoDate })), async (c) => {
    const { sql, env } = c.get("deps");
    const { date } = c.req.valid("query");
    const patients = await sql<{ user_id: string; first_name: string; last_name: string }[]>`
      select p.user_id, p.first_name, p.last_name
      from caregiver_patients cp join patients p on p.user_id = cp.patient_id
      where cp.caregiver_id = ${c.get("user").id} order by p.first_name`;
    const meds = await listMedications(
      sql,
      env.MEDICATIONS_KEY,
      patients.map((p) => p.user_id),
    );
    const out = [];
    for (const p of patients) {
      out.push({
        patient: { id: p.user_id, first_name: p.first_name, last_name: p.last_name },
        tasks: await checklist(
          sql,
          p.user_id,
          date,
          meds.filter((m) => m.patient_id === p.user_id),
        ),
      });
    }
    return c.json({ date, patients: out });
  })
  .post(
    "/completions",
    validate(
      "json",
      z.object({
        date: isoDate,
        patient_id: uuid,
        task_key: z.string().min(1).max(100),
        done: z.boolean(),
      }),
    ),
    async (c) => {
      const { sql, env } = c.get("deps");
      const b = c.req.valid("json");
      const caregiverId = c.get("user").id;
      await assertAssigned(sql, caregiverId, b.patient_id);
      if (b.done) {
        const meds = await listMedications(sql, env.MEDICATIONS_KEY, [b.patient_id]);
        await assertTaskKey(sql, b.patient_id, b.task_key, meds);
        await sql`insert into task_completions (date, patient_id, task_key, caregiver_id)
                  values (${b.date}, ${b.patient_id}, ${b.task_key}, ${caregiverId})
                  on conflict (date, patient_id, task_key) do nothing`;
      } else {
        await sql`delete from task_completions where date = ${b.date} and patient_id = ${b.patient_id} and task_key = ${b.task_key}`;
      }
      return c.json({ ok: true as const });
    },
  )
  .post(
    "/templates",
    validate(
      "json",
      z.object({
        patient_id: uuid,
        text: z.string().trim().min(1, "Escribí la tarea.").max(200),
        time: hhmmTime.optional(),
      }),
    ),
    async (c) => {
      const { sql } = c.get("deps");
      const b = c.req.valid("json");
      await assertAssigned(sql, c.get("user").id, b.patient_id);
      const [row] = await sql<{ id: string }[]>`
        insert into task_templates (patient_id, text, time) values (${b.patient_id}, ${b.text}, ${b.time ?? null}) returning id`;
      return c.json({ id: row!.id }, 201);
    },
  )
  .delete("/templates/:id", validate("param", z.object({ id: uuid })), async (c) => {
    const { sql } = c.get("deps");
    const rows = await sql`
      delete from task_templates t using caregiver_patients cp
      where t.id = ${c.req.valid("param").id} and cp.patient_id = t.patient_id and cp.caregiver_id = ${c.get("user").id}
      returning t.id`;
    if (!rows.length) throw notFound("No encontramos esa tarea.");
    return c.json({ ok: true as const });
  });
