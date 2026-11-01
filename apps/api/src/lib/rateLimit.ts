import type { Sql } from "../db.js";
import { HttpError } from "../errors.js";

/**
 * Cuenta un pedido para `key` y lanza 429 si ya hubo `limit` en la ventana. El lock, el conteo y
 * el insert van en la misma transacción (el advisory lock solo vale mientras ella dure), así dos
 * pedidos simultáneos no se saltean el límite. Se confirma antes de la acción que limita: los
 * intentos fallidos también cuentan.
 */
export async function hit(
  sql: Sql,
  key: string,
  opts: { limit: number; windowMs: number; now: Date; message: string },
): Promise<void> {
  await sql.begin(async (tx) => {
    await tx`select pg_advisory_xact_lock(hashtext(${key}))`;
    const [counted] = await tx<{ n: number }[]>`
      select count(*)::int as n from rate_hits
      where key = ${key} and at > ${new Date(opts.now.getTime() - opts.windowMs)}`;
    if ((counted?.n ?? 0) >= opts.limit) throw new HttpError(429, "rate_limited", opts.message);
    await tx`insert into rate_hits (key, at) values (${key}, ${opts.now})`;
  });
}
