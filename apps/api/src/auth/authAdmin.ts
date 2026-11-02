import type { AuthAdmin } from "../deps.js";
import { HttpError, badRequest, conflict } from "../errors.js";

const unavailable = (message: string) => new HttpError(502, "auth_unavailable", message);

/** Cuerpo de error de Supabase Auth: `error_code` (nuevo) o `code` (viejo) y `msg`. */
async function authErrorOf(res: Response): Promise<{ code?: string; msg?: string }> {
  const body = (await res.json().catch(() => ({}))) as {
    error_code?: string;
    code?: string | number;
    msg?: string;
    message?: string;
  };
  return {
    code: body.error_code ?? (typeof body.code === "string" ? body.code : undefined),
    msg: body.msg ?? body.message,
  };
}

/** API de administración de Supabase Auth (service role; solo vive en la API). */
export function createSupabaseAuthAdmin(supabaseUrl: string, serviceRoleKey: string): AuthAdmin {
  const base = `${supabaseUrl.replace(/\/$/, "")}/auth/v1/admin/users`;
  const headers = {
    Authorization: `Bearer ${serviceRoleKey}`,
    apikey: serviceRoleKey,
    "Content-Type": "application/json",
  };
  // Sin esto la causa (clave de servicio vencida, límite, red) no queda en ningún lado.
  const fail = (op: string, status: number | undefined, detail: unknown) =>
    console.error("supabase auth", { op, status, ...(detail as object) });
  return {
    async createUser(email, password) {
      const msg = "No pudimos crear la cuenta de ingreso ahora. Probá de nuevo en un rato.";
      let res: Response;
      try {
        res = await fetch(base, {
          method: "POST",
          headers,
          body: JSON.stringify({ email, password, email_confirm: true }),
        });
      } catch (e) {
        fail("createUser", undefined, { message: (e as Error).message });
        throw unavailable(msg);
      }
      if (res.ok) return ((await res.json()) as { id: string }).id;
      const { code, msg: detail } = await authErrorOf(res);
      // 422 email_exists: hay un usuario de Auth con ese mail aunque no tenga fila en users.
      if (code === "email_exists" || (res.status === 422 && !code))
        throw conflict("Ya hay una cuenta con ese mail.", "email_taken");
      if (code === "weak_password")
        throw badRequest("Esa contraseña es muy débil. Probá con una más larga.", "weak_password");
      if (code === "email_address_invalid") throw badRequest("Revisá el mail.", "invalid_input");
      fail("createUser", res.status, { code, message: detail?.slice(0, 200) });
      throw unavailable(msg);
    },
    async deleteUser(id) {
      let res: Response;
      try {
        res = await fetch(`${base}/${id}`, { method: "DELETE", headers });
      } catch (e) {
        fail("deleteUser", undefined, { message: (e as Error).message });
        throw unavailable(
          "No pudimos dar de baja la cuenta de ingreso. Probá de nuevo en un rato.",
        );
      }
      if (res.ok || res.status === 404) return;
      const { code, msg: detail } = await authErrorOf(res);
      fail("deleteUser", res.status, { code, message: detail?.slice(0, 200) });
      throw unavailable("No pudimos dar de baja la cuenta de ingreso. Probá de nuevo en un rato.");
    },
  };
}
