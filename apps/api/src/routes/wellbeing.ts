import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../deps.js";
import { newWellbeing } from "../lib/schemas.js";
import { TZ } from "../lib/time.js";
import { validate } from "../lib/validate.js";

// El registro de bienestar lo ve solo su dueño: no hay ninguna ruta de admin ni del asistente que lo lea.
export const wellbeing = new Hono<AppEnv>()
  .post("/", validate("json", newWellbeing), async (c) => {
    const b = c.req.valid("json");
    const [row] = await c.get("deps").sql<{ id: string; at: Date }[]>`
      insert into wellbeing_records (caregiver_id, mood, energy, stress, note)
      values (${c.get("user").id}, ${b.mood}, ${b.energy}, ${b.stress}, ${b.note})
      returning id, at`;
    return c.json({ id: row!.id, at: row!.at.toISOString() }, 201);
  })
  .get(
    "/",
    validate("query", z.object({ limit: z.coerce.number().int().min(1).max(500).default(100) })),
    async (c) => {
      const rows = await c.get("deps").sql<
        { id: string; at: Date; mood: number; energy: number; stress: number; note: string }[]
      >`
      select id, at, mood, energy, stress, note from wellbeing_records
      where caregiver_id = ${c.get("user").id} order by at desc limit ${c.req.valid("query").limit}`;
      return c.json({ records: rows.map((r) => ({ ...r, at: r.at.toISOString() })) });
    },
  )
  .get(
    "/weekly",
    validate("query", z.object({ weeks: z.coerce.number().int().min(1).max(52).default(12) })),
    async (c) => {
      const { sql } = c.get("deps");
      const id = c.get("user").id;
      const weeks = c.req.valid("query").weeks;
      const week = await sql<
        { week_start: string; count: number; mood: number; energy: number; stress: number }[]
      >`
      select date_trunc('week', at at time zone ${TZ})::date as week_start,
             count(*)::int as count, avg(mood)::float as mood, avg(energy)::float as energy, avg(stress)::float as stress
      from wellbeing_records
      where caregiver_id = ${id} and at >= now() - (${weeks} * interval '7 days')
      group by 1 order by 1 desc`;
      // Ánimo por día: el último registro de cada día.
      const days = await sql<{ day: string; mood: number }[]>`
      select distinct on (day) (at at time zone ${TZ})::date as day, mood
      from wellbeing_records
      where caregiver_id = ${id} and at >= now() - (${weeks} * interval '7 days')
      order by day, at desc`;
      return c.json({
        weeks: week.map((w) => ({
          week_start: w.week_start,
          count: w.count,
          avg_mood: w.mood,
          avg_energy: w.energy,
          avg_stress: w.stress,
          mood_by_day: Object.fromEntries(
            days.filter((d) => weekOf(d.day) === w.week_start).map((d) => [d.day, d.mood]),
          ) as Record<string, number>,
        })),
      });
    },
  );

/** Lunes de la semana de una fecha "YYYY-MM-DD". */
function weekOf(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}
