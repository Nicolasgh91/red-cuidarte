// Servidor local: pnpm --filter api dev (lee variables de .env.local vía `node --env-file`).
import { serve } from "@hono/node-server";
import { createApp } from "./app.js";
import { createDeps } from "./createDeps.js";

const port = Number(process.env.PORT ?? 8787);
serve({ fetch: createApp(createDeps()).fetch, port }, () =>
  console.log(`API en http://localhost:${port}`),
);
