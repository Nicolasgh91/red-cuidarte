import { Hono } from "hono";
import { cors } from "hono/cors";
import { createMiddleware } from "hono/factory";
import { authenticate, requireRole } from "./auth/middleware.js";
import type { AppEnv, Deps } from "./deps.js";
import { HttpError } from "./errors.js";
import { admin } from "./routes/admin.js";
import { assistant } from "./routes/assistant.js";
import { demo } from "./routes/demo.js";
import { device } from "./routes/device.js";
import { internal } from "./routes/internal.js";
import { me } from "./routes/me.js";
import { patient } from "./routes/patient.js";
import { reminders } from "./routes/reminders.js";
import { shifts } from "./routes/shifts.js";
import { tasks } from "./routes/tasks.js";
import { wellbeing } from "./routes/wellbeing.js";

/**
 * Un único handler para toda la API (Vercel Function). Las dependencias se inyectan:
 * en producción vienen de createDeps() y en los tests son locales.
 * AppType se exporta para el cliente tipado del front (Hono RPC).
 */
export function createApp(deps: Deps) {
  const base = new Hono<AppEnv>()
    .use(
      "*",
      cors({
        origin: (origin) => (deps.env.ALLOWED_ORIGINS.includes(origin) ? origin : null),
        allowHeaders: ["Authorization", "Content-Type", "X-Device-Token"],
        allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
        maxAge: 7200,
      }),
    )
    // Respuestas por usuario: que ningún CDN o proxy (la web llama por un rewrite) las guarde.
    .use(
      "*",
      createMiddleware<AppEnv>(async (c, next) => {
        await next();
        if (c.req.method !== "OPTIONS") c.res.headers.set("Cache-Control", "private, no-store");
      }),
    )
    .use(
      "*",
      createMiddleware<AppEnv>(async (c, next) => {
        if (!deps.sqlPerRequest) {
          c.set("deps", deps);
          return next();
        }
        const sql = deps.sqlPerRequest();
        c.set("deps", { ...deps, sql });
        try {
          await next();
        } finally {
          await sql.end({ timeout: 0 }).catch(() => undefined);
        }
      }),
    );

  const device_ = new Hono<AppEnv>()
    .use("*", authenticate({ requireDevice: false }))
    .route("/", device);

  const bound = new Hono<AppEnv>()
    .use("*", authenticate({ requireDevice: true }))
    .route("/me", me)
    .route("/shifts", new Hono<AppEnv>().use("*", requireRole("caregiver")).route("/", shifts))
    .route("/tasks", new Hono<AppEnv>().use("*", requireRole("caregiver")).route("/", tasks))
    .route(
      "/wellbeing",
      new Hono<AppEnv>().use("*", requireRole("caregiver")).route("/", wellbeing),
    )
    .route(
      "/reminders",
      new Hono<AppEnv>().use("*", requireRole("caregiver")).route("/", reminders),
    )
    .route(
      "/assistant",
      new Hono<AppEnv>().use("*", requireRole("caregiver")).route("/", assistant),
    )
    .route("/patient", new Hono<AppEnv>().use("*", requireRole("patient")).route("/", patient))
    .route("/admin", new Hono<AppEnv>().use("*", requireRole("admin")).route("/", admin));

  const app = base
    .get("/health", (c) => c.json({ ok: true as const }))
    .route("/internal", internal)
    .route("/demo", demo)
    .route("/device", device_)
    .route("/", bound);

  app.onError((err, c) => {
    if (err instanceof HttpError) {
      return c.json({ error: { code: err.code, message: err.message } }, err.status);
    }
    console.error("unhandled", err);
    return c.json(
      { error: { code: "internal", message: "Algo salió mal de nuestro lado. Probá de nuevo." } },
      500,
    );
  });
  app.notFound((c) =>
    c.json({ error: { code: "not_found", message: "No encontramos esa ruta." } }, 404),
  );
  return app;
}

export type AppType = ReturnType<typeof createApp>;
export type { Deps } from "./deps.js";
