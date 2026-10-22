// Aplica supabase/migrations al Postgres local de docker-compose (sin Supabase CLI).
// Uso: node scripts/migrate-local.mjs [nombre_de_base]   (por defecto: cuidarte)
// Imita supabase_migrations.schema_migrations y crea los roles anon/authenticated que en Supabase ya existen.
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dir = join(root, "supabase", "migrations");
const database = process.argv[2] ?? "cuidarte";

function psql(db, sql, { quiet = true } = {}) {
  return execFileSync(
    "docker",
    [
      "compose",
      "exec",
      "-T",
      "db",
      "psql",
      "-U",
      "postgres",
      "-d",
      db,
      "-v",
      "ON_ERROR_STOP=1",
      "-qAt",
    ],
    {
      cwd: root,
      input: sql,
      encoding: "utf8",
      stdio: ["pipe", "pipe", quiet ? "pipe" : "inherit"],
    },
  );
}

const exists = psql("postgres", `select 1 from pg_database where datname = '${database}'`).trim();
if (!exists) psql("postgres", `create database ${database}`);

psql(
  database,
  `do $$ begin
     if not exists (select from pg_roles where rolname = 'anon') then create role anon nologin; end if;
     if not exists (select from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
   end $$;
   create schema if not exists supabase_migrations;
   create table if not exists supabase_migrations.schema_migrations (version text primary key, name text);`,
);

const applied = new Set(
  psql(database, "select version from supabase_migrations.schema_migrations")
    .split("\n")
    .filter(Boolean),
);
for (const file of readdirSync(dir)
  .filter((f) => f.endsWith(".sql"))
  .sort()) {
  const [version, ...rest] = file.replace(/\.sql$/, "").split("_");
  if (applied.has(version)) continue;
  psql(
    database,
    `begin;\n${readFileSync(join(dir, file), "utf8")}\ninsert into supabase_migrations.schema_migrations values ('${version}', '${rest.join("_")}');\ncommit;`,
  );
  console.log(`aplicada ${file} en ${database}`);
}
console.log(`${database}: al día`);
