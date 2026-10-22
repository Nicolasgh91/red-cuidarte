import postgres from "postgres";

export type Sql = postgres.Sql<{ date: string }>;

/**
 * Siempre por el pooler de Supabase (cada invocación puede abrir una conexión nueva).
 * Con el pooler en modo transacción no hay prepared statements.
 */
export function createSql(url: string, opts: { max?: number; quiet?: boolean } = {}): Sql {
  return postgres(url, {
    max: opts.max ?? 1,
    prepare: false,
    idle_timeout: 20,
    connect_timeout: 10,
    ...(opts.quiet ? { onnotice: () => {} } : {}),
    types: {
      // date como "YYYY-MM-DD" (sin pasar por Date y la zona horaria)
      date: {
        to: 1082,
        from: [1082],
        serialize: (x: unknown) => String(x),
        parse: (x: string) => x,
      },
    },
  });
}

export interface SqlPool {
  /** Conexión para un pedido. Cada get() va con su release() al terminar el pedido. */
  get(): Sql;
  release(): void;
}

/**
 * Reusa la conexión mientras la función está activa y la renueva después de un rato sin uso.
 * En Vercel la función se congela entre pedidos y el pooler de Supabase corta la conexión
 * guardada sin avisar: reusarla dejaba el pedido colgado (medido: sana a los 3 min, muerta a
 * los 6). Pasados `staleMs` sin pedidos en curso se descarta y se abre otra; nunca se cierra
 * una conexión con pedidos en curso.
 */
export function createRecyclingSql(
  url: string,
  opts: { staleMs?: number; now?: () => number; create?: (url: string) => Sql } = {},
): SqlPool {
  const { staleMs = 30_000, now = Date.now, create = (u: string) => createSql(u) } = opts;
  let sql: Sql | null = null;
  let active = 0;
  let lastUsed = 0;
  return {
    get() {
      const t = now();
      if (!sql || (active === 0 && t - lastUsed > staleMs)) {
        // La vieja puede estar muerta: se cierra sin esperarla.
        sql?.end({ timeout: 0 }).catch(() => undefined);
        sql = create(url);
      }
      active++;
      lastUsed = t;
      return sql;
    },
    release() {
      active = Math.max(0, active - 1);
      lastUsed = now();
    },
  };
}
