import type { AuthAdmin } from "../deps.js";
import { conflict } from "../errors.js";

/** API de administración de Supabase Auth (service role; solo vive en la API). */
export function createSupabaseAuthAdmin(supabaseUrl: string, serviceRoleKey: string): AuthAdmin {
  const base = `${supabaseUrl.replace(/\/$/, "")}/auth/v1/admin/users`;
  const headers = {
    Authorization: `Bearer ${serviceRoleKey}`,
    apikey: serviceRoleKey,
    "Content-Type": "application/json",
  };
  return {
    async createUser(email, password) {
      const res = await fetch(base, {
        method: "POST",
        headers,
        body: JSON.stringify({ email, password, email_confirm: true }),
      });
      // 422 email_exists: hay un usuario de Auth con ese mail aunque no tenga fila en users.
      if (res.status === 422) throw conflict("Ya hay una cuenta con ese mail.", "email_taken");
      if (!res.ok) throw new Error(`Supabase Auth: no se pudo crear el usuario (${res.status})`);
      const body = (await res.json()) as { id: string };
      return body.id;
    },
    async deleteUser(id) {
      const res = await fetch(`${base}/${id}`, { method: "DELETE", headers });
      if (!res.ok && res.status !== 404)
        throw new Error(`Supabase Auth: no se pudo borrar el usuario (${res.status})`);
    },
  };
}
