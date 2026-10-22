import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import postgres from "postgres";

export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgres://postgres:postgres@localhost:54329/cuidarte_test";

/** Deja la base de pruebas limpia y con todas las migraciones aplicadas (Postgres local o de CI). */
export default async function setup() {
  process.env.TEST_DATABASE_URL = TEST_DATABASE_URL;
  const url = new URL(TEST_DATABASE_URL);
  const dbName = url.pathname.slice(1);
  const adminUrl = new URL(TEST_DATABASE_URL);
  adminUrl.pathname = "/postgres";

  const admin = postgres(adminUrl.toString(), { max: 1, onnotice: () => {} });
  try {
    const [row] = await admin`select 1 from pg_database where datname = ${dbName}`;
    if (!row) await admin.unsafe(`create database ${dbName}`);
  } finally {
    await admin.end();
  }

  const sql = postgres(TEST_DATABASE_URL, { max: 1, onnotice: () => {} });
  try {
    await sql.unsafe(`
      drop schema if exists public cascade;
      drop schema if exists supabase_migrations cascade;
      create schema public;
      do $$ begin
        if not exists (select from pg_roles where rolname = 'anon') then create role anon nologin; end if;
        if not exists (select from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
      end $$;
      grant usage on schema public to anon, authenticated;
    `);
    const dir = join(import.meta.dirname, "..", "..", "..", "supabase", "migrations");
    for (const file of readdirSync(dir)
      .filter((f) => f.endsWith(".sql"))
      .sort()) {
      await sql.unsafe(readFileSync(join(dir, file), "utf8"));
    }
  } finally {
    await sql.end();
  }
}
