import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../deps.js";
import { badRequest, conflict, notFound } from "../errors.js";
import { email, newCaregiver, newMedication, newPatient, uuid } from "../lib/schemas.js";
import { addDays, dayNum, nowAR } from "../lib/time.js";
import { validate } from "../lib/validate.js";
import { contentSchemas } from "../content/schemas.js";
import { CONTENT_KEYS } from "../content/site.js";
import { createCaregiver } from "../services/caregivers.js";
import { loadContent } from "../services/content.js";
import { createPatient } from "../services/patients.js";
import { addMedication, listMedications } from "../services/medications.js";
import { sendLogged } from "../services/mail.js";

const idParam = z.object({ id: uuid });
const keyParam = z.object({ key: z.enum(CONTENT_KEYS) });

export const admin = new Hono<AppEnv>()
  .get("/summary", async (c) => {
    const { sql, now } = c.get("deps");
    const today = nowAR(now()).date;
    const monday = addDays(today, -((new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7));
    const [counts] = await sql<
      { caregivers: number; patients: number; week_shifts: number; blocked: number }[]
    >`
      select (select count(*) from caregivers)::int as caregivers,
             (select count(*) from patients)::int as patients,
             (select count(*) from shifts where date between ${monday} and ${addDays(monday, 6)})::int as week_shifts,
             (select count(distinct user_id) from device_attempts where status = 'blocked')::int as blocked`;
    const cgs = await sql<
      { first_name: string; birth_date: string }[]
    >`select first_name, birth_date from caregivers`;
    const y = Number(today.slice(0, 4));
    const nextBirthday = cgs
      .map((cg) => {
        const [, bm, bd] = cg.birth_date.split("-").map(Number) as [number, number, number];
        let next = `${y}-${String(bm).padStart(2, "0")}-${String(bd).padStart(2, "0")}`;
        if (next < today)
          next = `${y + 1}-${String(bm).padStart(2, "0")}-${String(bd).padStart(2, "0")}`;
        return { first_name: cg.first_name, date: next, days: dayNum(next) - dayNum(today) };
      })
      .sort((a, b) => a.days - b.days)[0];
    return c.json({
      caregivers: counts!.caregivers,
      patients: counts!.patients,
      shifts_this_week: counts!.week_shifts,
      blocked_attempts: counts!.blocked,
      next_birthday: nextBirthday ?? null,
    });
  })
  .get("/admins", async (c) => {
    const rows = await c.get("deps")
      .sql`select user_id as id, first_name, last_name, email, mobile from admins order by first_name`;
    return c.json({
      admins: rows.map((r) => ({ ...r })) as {
        id: string;
        first_name: string;
        last_name: string;
        email: string;
        mobile: string;
      }[],
    });
  })
  .get("/caregivers", async (c) => {
    const { sql } = c.get("deps");
    const rows = await sql<
      {
        id: string;
        first_name: string;
        last_names: string;
        phone: string;
        email: string;
        birth_date: string;
        patient_ids: string[];
      }[]
    >`
      select c.user_id as id, c.first_name, c.last_names, c.phone, c.email, c.birth_date,
             coalesce(array_agg(cp.patient_id) filter (where cp.patient_id is not null), '{}') as patient_ids
      from caregivers c left join caregiver_patients cp on cp.caregiver_id = c.user_id
      group by c.user_id order by c.first_name, c.last_names`;
    return c.json({ caregivers: rows.map((r) => ({ ...r })) });
  })
  .post("/caregivers", validate("json", newCaregiver), async (c) => {
    const id = await createCaregiver(c.get("deps"), c.req.valid("json"));
    return c.json({ id }, 201);
  })
  .put(
    "/caregivers/:id/patients",
    validate("param", idParam),
    validate("json", z.object({ patient_ids: z.array(uuid) })),
    async (c) => {
      const { sql } = c.get("deps");
      const { id } = c.req.valid("param");
      const ids = [...new Set(c.req.valid("json").patient_ids)];
      if (!(await sql`select 1 from caregivers where user_id = ${id}`).length)
        throw notFound("No encontramos a ese cuidador/a.");
      if (
        ids.length &&
        (await sql`select user_id from patients where user_id in ${sql(ids)}`).length !== ids.length
      ) {
        throw conflict("Alguno de los pacientes elegidos no existe.", "unknown_patient");
      }
      await sql.begin(async (tx) => {
        await tx`delete from caregiver_patients where caregiver_id = ${id}`;
        for (const pid of ids)
          await tx`insert into caregiver_patients (caregiver_id, patient_id) values (${id}, ${pid})`;
      });
      return c.json({ ok: true as const });
    },
  )
  .get("/patients", async (c) => {
    const { sql, env } = c.get("deps");
    const rows = await sql<
      { id: string; first_name: string; last_name: string; has_login: boolean }[]
    >`
      select p.user_id as id, p.first_name, p.last_name, (u.email is not null) as has_login
      from patients p join users u on u.id = p.user_id order by p.first_name`;
    const meds = await listMedications(
      sql,
      env.MEDICATIONS_KEY,
      rows.map((r) => r.id),
    );
    const links = await sql<
      { caregiver_id: string; patient_id: string }[]
    >`select caregiver_id, patient_id from caregiver_patients`;
    return c.json({
      patients: rows.map((r) => ({
        ...r,
        caregiver_ids: links.filter((l) => l.patient_id === r.id).map((l) => l.caregiver_id),
        medications: meds
          .filter((m) => m.patient_id === r.id)
          .map(({ id, name, dose, times }) => ({ id, name, dose, times })),
      })),
    });
  })
  .post("/patients", validate("json", newPatient), async (c) => {
    return c.json({ id: await createPatient(c.get("deps"), c.req.valid("json")) }, 201);
  })
  .post(
    "/patients/:id/medications",
    validate("param", idParam),
    validate("json", newMedication),
    async (c) => {
      const { sql, env } = c.get("deps");
      const { id } = c.req.valid("param");
      if (!(await sql`select 1 from patients where user_id = ${id}`).length)
        throw notFound("No encontramos a esa persona.");
      const med = await addMedication(sql, env.MEDICATIONS_KEY, id, c.req.valid("json"));
      return c.json({ id: med.id, name: med.name, dose: med.dose, times: med.times }, 201);
    },
  )
  .delete("/medications/:id", validate("param", idParam), async (c) => {
    const rows = await c.get("deps")
      .sql`delete from medications where id = ${c.req.valid("param").id} returning id`;
    if (!rows.length) throw notFound("No encontramos ese medicamento.");
    return c.json({ ok: true as const });
  })
  .get("/devices", async (c) => {
    const rows = await c.get("deps").sql<
      {
        id: string;
        role: "caregiver" | "admin" | "patient";
        name: string;
        label: string | null;
        last_ip: string | null;
        last_seen_at: Date | null;
        blocked: { label: string; ip: string | null; at: string } | null;
      }[]
    >`
      select u.id, u.role,
             coalesce(c.first_name || ' ' || c.last_names, a.first_name || ' ' || a.last_name, p.first_name || ' ' || p.last_name) as name,
             d.label, d.last_ip, d.last_seen_at,
             (select row_to_json(x) from (
                select label, ip, at from device_attempts da
                where da.user_id = u.id and da.status = 'blocked' order by at desc limit 1) x) as blocked
      from users u
        left join caregivers c on c.user_id = u.id
        left join admins a on a.user_id = u.id
        left join patients p on p.user_id = u.id
        left join devices d on d.user_id = u.id
      where u.email is not null
      order by u.role, name`;
    return c.json({
      devices: rows.map((r) => ({ ...r, last_seen_at: r.last_seen_at?.toISOString() ?? null })),
    });
  })
  .post("/devices/:id/release", validate("param", idParam), async (c) => {
    // "Liberar": la cuenta queda sin dispositivo y el próximo ingreso registra uno nuevo.
    const rows = await c.get("deps")
      .sql`delete from devices where user_id = ${c.req.valid("param").id} returning user_id`;
    if (!rows.length) throw notFound("Esa cuenta no tiene dispositivo registrado.");
    return c.json({ ok: true as const });
  })
  .post("/devices/:id/authorize", validate("param", idParam), async (c) => {
    // "Autorizar el nuevo": habilita registrar la credencial del intento bloqueado; reemplaza a la anterior.
    const { sql } = c.get("deps");
    const id = c.req.valid("param").id;
    const rows = await sql`
      update device_attempts set status = 'authorized'
      where id = (select id from device_attempts where user_id = ${id} and status = 'blocked' order by at desc limit 1)
      returning id`;
    if (!rows.length) throw notFound("No hay un intento bloqueado para autorizar.");
    await sql`delete from device_attempts where user_id = ${id} and status = 'blocked'`;
    return c.json({ ok: true as const });
  })
  .post("/mail/test", validate("json", z.object({ to: email })), async (c) => {
    const deps = c.get("deps");
    const to = c.req.valid("json").to;
    const status = await sendLogged(
      deps,
      {
        to,
        subject: "Prueba de Cuidarte+",
        text: "Si leés esto, el correo de Cuidarte+ está andando.",
      },
      "test",
      nowAR(deps.now()).year,
    );
    return c.json({ status });
  })
  .get("/mail/log", async (c) => {
    const rows = await c.get("deps").sql<
      {
        id: string;
        to_email: string;
        subject: string;
        kind: string;
        sent_at: Date;
        status: string;
        error: string | null;
      }[]
    >`
      select id, to_email, subject, kind, sent_at, status, error from mail_log order by sent_at desc limit 100`;
    return c.json({ log: rows.map((r) => ({ ...r, sent_at: r.sent_at.toISOString() })) });
  })
  .get("/content", async (c) => c.json(await loadContent(c.get("deps").sql)))
  .put("/content/:key", validate("param", keyParam), async (c) => {
    // Cada clave reemplaza al texto original completo; se valida con su esquema.
    const { sql } = c.get("deps");
    const { key } = c.req.valid("param");
    const body: unknown = await c.req.json().catch(() => undefined);
    const parsed = contentSchemas[key].safeParse(body);
    if (!parsed.success) {
      throw badRequest(parsed.error.issues[0]?.message ?? "Revisá los datos.", "invalid_input");
    }
    await sql`
      insert into site_content (key, value, updated_by) values (${key}, ${sql.json(parsed.data as unknown as Parameters<typeof sql.json>[0])}, ${c.get("user").id})
      on conflict (key) do update set value = excluded.value, updated_at = now(), updated_by = excluded.updated_by`;
    return c.json({ ok: true as const });
  })
  .delete("/content/:key", validate("param", keyParam), async (c) => {
    // Volver al texto original.
    await c.get("deps").sql`delete from site_content where key = ${c.req.valid("param").key}`;
    return c.json({ ok: true as const });
  });
