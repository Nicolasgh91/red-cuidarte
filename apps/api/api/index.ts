// Entrada de Vercel Functions (Node.js). Un único handler para toda la API; vercel.json reescribe todo a /api.
import { handle } from "hono/vercel";
import { createApp } from "../src/app.js";
import { createDeps } from "../src/createDeps.js";
import { createRecyclingSql } from "../src/db.js";

// Las dependencias se crean al primer pedido (no al importar), así el build no necesita variables.
let handler: ReturnType<typeof handle> | undefined;

// La conexión a Postgres se reusa mientras hay uso y se renueva tras un rato sin pedidos: la
// función se congela entre pedidos y una conexión guardada puede estar muerta al despertar.
const get = () => {
  if (handler) return handler;
  const deps = createDeps();
  return (handler = handle(
    createApp({ ...deps, sqlPool: createRecyclingSql(deps.env.DATABASE_URL) }),
  ));
};

export const GET = (req: Request) => get()(req);
export const POST = (req: Request) => get()(req);
export const PUT = (req: Request) => get()(req);
export const DELETE = (req: Request) => get()(req);
export const OPTIONS = (req: Request) => get()(req);
