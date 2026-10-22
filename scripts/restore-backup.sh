#!/usr/bin/env bash
# Restaura en el Postgres local un backup de backup.yml (para probar que sirve).
# Uso: BACKUP_PASSPHRASE=... scripts/restore-backup.sh cuidarte-YYYYMMDD.dump.gpg [base_destino]
set -euo pipefail

file="${1:?Falta el archivo .dump.gpg}"
target="${2:-cuidarte_restore}"
: "${BACKUP_PASSPHRASE:?Falta BACKUP_PASSPHRASE}"
cd "$(dirname "$0")/.."

tmp="$(mktemp)"
trap 'shred -u "$tmp" 2>/dev/null || rm -f "$tmp"' EXIT
gpg --batch --yes --pinentry-mode loopback --passphrase "$BACKUP_PASSPHRASE" --decrypt --output "$tmp" "$file"

docker compose exec -T db psql -U postgres -d postgres -qc "drop database if exists ${target}" -c "create database ${target}"
# En Supabase ya existen los roles anon/authenticated, el esquema public y la extensión btree_gist
# (el volcado solo trae los esquemas public y supabase_migrations, sin extensiones). Se preparan acá.
docker compose exec -T db psql -U postgres -d "$target" -q <<'SQL'
do $$ begin
  if not exists (select from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
end $$;
create schema if not exists extensions;
create extension if not exists btree_gist with schema extensions;
SQL
# Sin la línea "CREATE SCHEMA public": el esquema ya existe en la base destino.
toc="$(mktemp)"
trap 'shred -u "$tmp" 2>/dev/null || rm -f "$tmp"; rm -f "$toc"' EXIT
docker compose exec -T db pg_restore -l < "$tmp" | grep -v -E '^[0-9]+; [0-9]+ [0-9]+ SCHEMA - public ' > "$toc"
docker compose exec -T db sh -c 'cat > /tmp/restore.toc' < "$toc"
docker compose exec -T db sh -c 'cat > /tmp/restore.dump' < "$tmp"
docker compose exec -T db pg_restore -U postgres -d "$target" --no-owner --exit-on-error -L /tmp/restore.toc /tmp/restore.dump
docker compose exec -T db rm -f /tmp/restore.toc /tmp/restore.dump
echo "Restaurado en la base local '${target}'."
