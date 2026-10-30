import type { Context } from "hono";

/** IP de quien llama (Vercel la pone primera en x-forwarded-for). Solo para registro y límites. */
export const clientIp = (c: Context) =>
  c.req.header("x-forwarded-for")?.split(",")[0]?.trim() || c.req.header("x-real-ip") || null;
