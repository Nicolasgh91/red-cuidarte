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
