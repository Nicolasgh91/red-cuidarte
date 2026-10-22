import { timingSafeEqual } from "node:crypto";
import { Hono } from "hono";
import type { Deps } from "../deps.js";
import { forbidden } from "../errors.js";
import { runDailyJob } from "../services/dailyJob.js";

const safeEqual = (a: string, b: string) => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

// Vercel Cron manda "Authorization: Bearer $CRON_SECRET" cuando existe la variable CRON_SECRET.
export const internal = new Hono<{ Variables: { deps: Deps } }>().get("/jobs/daily", async (c) => {
  const deps = c.get("deps");
  const header = c.req.header("Authorization") ?? "";
  if (!safeEqual(header, `Bearer ${deps.env.CRON_SECRET}`))
    throw forbidden("No autorizado.", "bad_cron_secret");
  return c.json(await runDailyJob(deps));
});
