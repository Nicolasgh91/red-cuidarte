import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../deps.js";
import { notFound } from "../errors.js";
import { isoDate, newShift, uuid } from "../lib/schemas.js";
import { addDays } from "../lib/time.js";
import { validate } from "../lib/validate.js";
import { createShifts, deleteShift, listShifts, repeatWeekly } from "../services/shifts.js";

export const shifts = new Hono<AppEnv>()
  .get("/", validate("query", z.object({ from: isoDate, to: isoDate })), async (c) => {
    const { from, to } = c.req.valid("query");
    const max = addDays(from, 366);
    return c.json({
      shifts: await listShifts(c.get("deps").sql, c.get("user").id, from, to > max ? max : to),
    });
  })
  .post("/", validate("json", newShift), async (c) => {
    const b = c.req.valid("json");
    const created = await createShifts(
      c.get("deps").sql,
      c.get("user").id,
      repeatWeekly(
        { patient_id: b.patient_id, date: b.date, start: b.start, end: b.end },
        b.repeat_weeks,
      ),
      "manual",
    );
    return c.json({ shifts: created }, 201);
  })
  .delete("/:id", validate("param", z.object({ id: uuid })), async (c) => {
    if (!(await deleteShift(c.get("deps").sql, c.get("user").id, c.req.valid("param").id)))
      throw notFound("No encontramos ese turno.");
    return c.json({ ok: true as const });
  });
