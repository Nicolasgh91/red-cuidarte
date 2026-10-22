import { Hono } from "hono";
import type { AppEnv } from "../deps.js";
import { DEFAULT_REMINDERS, reminderSettings } from "../lib/schemas.js";
import { validate } from "../lib/validate.js";

export const reminders = new Hono<AppEnv>()
  .get("/", async (c) => {
    const [row] = await c.get("deps").sql<{ water: unknown; stretch: unknown; relax: unknown }[]>`
      select water, stretch, relax from reminder_settings where caregiver_id = ${c.get("user").id}`;
    return c.json(
      row ? { water: row.water, stretch: row.stretch, relax: row.relax } : DEFAULT_REMINDERS,
    );
  })
  .put("/", validate("json", reminderSettings), async (c) => {
    const { sql } = c.get("deps");
    const b = c.req.valid("json");
    const relax = { on: b.relax.on, times: [...new Set(b.relax.times)].sort() };
    await sql`
      insert into reminder_settings (caregiver_id, water, stretch, relax)
      values (${c.get("user").id}, ${sql.json(b.water)}, ${sql.json(b.stretch)}, ${sql.json(relax)})
      on conflict (caregiver_id) do update set water = excluded.water, stretch = excluded.stretch, relax = excluded.relax`;
    return c.json({ ok: true as const });
  });
