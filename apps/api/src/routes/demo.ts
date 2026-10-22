import { Hono } from "hono";
import type { AppEnv, Role } from "../deps.js";
import { notFound } from "../errors.js";

// Modo demo: lista pública de los usuarios de la base para el selector de ingreso.
export const demo = new Hono<AppEnv>().get("/users", async (c) => {
  const { sql, env } = c.get("deps");
  if (!env.DEMO_MODE) throw notFound("No encontramos esa ruta.");
  const rows = await sql<{ id: string; role: Role; name: string; email: string | null }[]>`
    select u.id, u.role, u.email,
           coalesce(
             nullif(trim(coalesce(a.first_name || ' ' || a.last_name,
                                  c.first_name || ' ' || c.last_names,
                                  p.first_name || ' ' || p.last_name)), ''),
             u.email, 'Sin nombre') as name
    from users u
    left join admins a on a.user_id = u.id
    left join caregivers c on c.user_id = u.id
    left join patients p on p.user_id = u.id
    order by array_position(array['admin', 'caregiver', 'patient']::user_role[], u.role), name`;
  return c.json({ users: rows.map((r) => ({ ...r })) });
});
