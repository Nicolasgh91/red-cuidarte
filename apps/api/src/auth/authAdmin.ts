import type { AuthAdmin } from "../deps.js";

/** API de administración de Supabase Auth (service role; solo vive en la API). */
export function createSupabaseAuthAdmin(supabaseUrl: string, serviceRoleKey: string): AuthAdmin {
  const base = `${supabaseUrl.replace(/\/$/, "")}/auth/v1/admin/users`;
  const headers = {
    Authorization: `Bearer ${serviceRoleKey}`,
    apikey: serviceRoleKey,
    "Content-Type": "application/json",
  };
  return {
    async createUser(email) {
      const res = await fetch(base, {
        method: "POST",
        headers,
        body: JSON.stringify({ email, email_confirm: true }),
      });
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
