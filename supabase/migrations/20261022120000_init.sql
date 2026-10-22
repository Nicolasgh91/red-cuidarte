-- Cuidarte+ · esquema inicial (spec-v2, "Modelo de datos").
-- Solo la API accede a estas tablas. La Data API de Supabase queda sin acceso:
-- RLS activado en todas, sin políticas, y sin permisos para anon/authenticated.

-- En el esquema extensions (no en public): así sus funciones no quedan expuestas por la Data API.
create schema if not exists extensions;
create extension if not exists btree_gist with schema extensions;

create type user_role as enum ('caregiver', 'admin', 'patient');
create type shift_source as enum ('manual', 'assistant');
create type device_attempt_status as enum ('blocked', 'authorized');
create type webauthn_purpose as enum ('register', 'login');
create type mail_kind as enum ('birthday', 'test');

-- id = auth.users.id cuando la persona tiene acceso. Una persona cuidada sin mail
-- es solo una ficha (sin ingreso), por eso no hay FK a auth.users.
create table users (
  id uuid primary key,
  role user_role not null,
  email text unique,
  created_at timestamptz not null default now()
);

create table caregivers (
  user_id uuid primary key references users (id) on delete cascade,
  first_name text not null,
  last_names text not null,
  phone text not null,
  email text not null,
  birth_date date not null
);

create table admins (
  user_id uuid primary key references users (id) on delete cascade,
  first_name text not null,
  last_name text not null,
  email text not null,
  mobile text not null
);

create table patients (
  user_id uuid primary key references users (id) on delete cascade,
  first_name text not null,
  last_name text not null
);

-- name y dose se guardan cifrados por la aplicación (AES-256-GCM, ver docs/decisions.md).
create table medications (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references patients (user_id) on delete cascade,
  name bytea not null,
  dose bytea not null,
  times time[] not null default '{}'
);
create index medications_patient_idx on medications (patient_id);

create table caregiver_patients (
  caregiver_id uuid not null references caregivers (user_id) on delete cascade,
  patient_id uuid not null references patients (user_id) on delete cascade,
  primary key (caregiver_id, patient_id)
);
create index caregiver_patients_patient_idx on caregiver_patients (patient_id);

-- Un turno que termina a la misma hora o antes de empezar cruza la medianoche.
-- La API valida la superposición con mensajes claros; la restricción de exclusión
-- la garantiza también ante pedidos simultáneos.
create table shifts (
  id uuid primary key default gen_random_uuid(),
  caregiver_id uuid not null references caregivers (user_id) on delete cascade,
  patient_id uuid not null references patients (user_id) on delete cascade,
  date date not null,
  start_time time not null,
  end_time time not null,
  source shift_source not null default 'manual',
  constraint shifts_nonzero check (start_time <> end_time),
  constraint shifts_no_overlap exclude using gist (
    caregiver_id with =,
    tsrange(
      date + start_time,
      date + end_time + case when end_time < start_time then interval '1 day' else interval '0' end
    ) with &&
  )
);
create index shifts_caregiver_date_idx on shifts (caregiver_id, date);
create index shifts_patient_date_idx on shifts (patient_id, date);

create table task_templates (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references patients (user_id) on delete cascade,
  text text not null,
  time time
);
create index task_templates_patient_idx on task_templates (patient_id);

-- task_key = id de la plantilla, o "med-{medication_id}-{HH:MM}".
create table task_completions (
  date date not null,
  patient_id uuid not null references patients (user_id) on delete cascade,
  task_key text not null,
  caregiver_id uuid not null references caregivers (user_id) on delete cascade,
  done_at timestamptz not null default now(),
  primary key (date, patient_id, task_key)
);

create table wellbeing_records (
  id uuid primary key default gen_random_uuid(),
  caregiver_id uuid not null references caregivers (user_id) on delete cascade,
  at timestamptz not null default now(),
  mood smallint not null check (mood between 0 and 4),
  energy smallint not null check (energy between 0 and 4),
  stress smallint not null check (stress between 0 and 4),
  note text not null default ''
);
create index wellbeing_caregiver_at_idx on wellbeing_records (caregiver_id, at desc);

create table reminder_settings (
  caregiver_id uuid primary key references caregivers (user_id) on delete cascade,
  water jsonb not null,
  stretch jsonb not null,
  relax jsonb not null
);

create table devices (
  user_id uuid primary key references users (id) on delete cascade,
  credential_id text not null unique,
  public_key bytea not null,
  sign_count bigint not null default 0,
  label text not null,
  last_ip text,
  last_seen_at timestamptz,
  registered_at timestamptz not null default now()
);

create table device_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users (id) on delete cascade,
  label text not null,
  ip text,
  at timestamptz not null default now(),
  status device_attempt_status not null default 'blocked'
);
create index device_attempts_user_idx on device_attempts (user_id, at desc);

create table webauthn_challenges (
  user_id uuid not null references users (id) on delete cascade,
  challenge text not null,
  purpose webauthn_purpose not null,
  expires_at timestamptz not null,
  primary key (user_id, purpose)
);

-- year = año del cumpleaños (hora de Argentina). La unicidad aplica solo a cumpleaños:
-- los mails de prueba se pueden repetir.
create table mail_log (
  id uuid primary key default gen_random_uuid(),
  to_email text not null,
  subject text not null,
  kind mail_kind not null,
  year smallint not null,
  sent_at timestamptz not null default now(),
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed')),
  error text
);
create unique index mail_log_birthday_once on mail_log (to_email, kind, year) where kind = 'birthday';

create table assistant_usage (
  caregiver_id uuid not null references caregivers (user_id) on delete cascade,
  date date not null,
  messages integer not null default 0,
  primary key (caregiver_id, date)
);

-- RLS en todo el esquema público, sin políticas.
do $$
declare t text;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke all on all functions in schema public from anon, authenticated;
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke all on functions from anon, authenticated;
