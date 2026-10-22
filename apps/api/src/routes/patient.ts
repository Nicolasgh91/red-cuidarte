import { Hono } from "hono";
import type { AppEnv } from "../deps.js";
import { addDays, hhmm, nowAR, nowAbs, span, toMin } from "../lib/time.js";
import { listMedications } from "../services/medications.js";

// Persona cuidada: solo lectura de su propio día.
export const patient = new Hono<AppEnv>().get("/today", async (c) => {
  const { sql, env, now } = c.get("deps");
  const id = c.get("user").id;
  const today = nowAR(now()).date;
  const [p] = await sql<
    { first_name: string; last_name: string }[]
  >`select first_name, last_name from patients where user_id = ${id}`;
  const rows = await sql<
    { date: string; start_time: string; end_time: string; first_name: string; last_names: string }[]
  >`
    select s.date, s.start_time, s.end_time, c.first_name, c.last_names
    from shifts s join caregivers c on c.user_id = s.caregiver_id
    where s.patient_id = ${id} and s.date between ${addDays(today, -1)} and ${addDays(today, 60)}
    order by s.date, s.start_time`;
  const shifts = rows.map((r) => ({
    date: r.date,
    start: hhmm(r.start_time),
    end: hhmm(r.end_time),
    caregiver: `${r.first_name} ${r.last_names}`.trim(),
  }));
  const n = nowAbs(now());
  const current = shifts.find((s) => span(s)[0] <= n && span(s)[1] > n) ?? null;
  const next = shifts.find((s) => span(s)[0] > n) ?? null;
  const meds = await listMedications(sql, env.MEDICATIONS_KEY, [id]);
  const doses = meds
    .flatMap((m) => m.times.map((t) => ({ time: t, name: m.name, dose: m.dose })))
    .sort((a, b) => toMin(a.time) - toMin(b.time) || a.name.localeCompare(b.name));
  return c.json({
    patient: p ? { first_name: p.first_name, last_name: p.last_name } : null,
    date: today,
    today_shifts: shifts.filter((s) => s.date === today),
    current,
    next,
    doses,
  });
});
