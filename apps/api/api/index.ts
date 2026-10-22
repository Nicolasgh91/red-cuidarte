// Entrada de Vercel Functions (Node.js). Un único handler para toda la API; vercel.json reescribe todo a /api.
import { handle } from "hono/vercel";
import { createApp } from "../src/app.js";
import { createDeps } from "../src/createDeps.js";

// Las dependencias se crean al primer pedido (no al importar), así el build no necesita variables.
let handler: ReturnType<typeof handle> | undefined;

const get = () => (handler ??= handle(createApp(createDeps())));

export const GET = (req: Request) => get()(req);
export const POST = (req: Request) => get()(req);
export const PUT = (req: Request) => get()(req);
export const DELETE = (req: Request) => get()(req);
export const OPTIONS = (req: Request) => get()(req);
