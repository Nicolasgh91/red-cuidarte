-- La passkey es el segundo factor y deja de atarse a un equipo (docs/decisions.md, F6).
-- Aditiva: se ejecuta ANTES del deploy de la API nueva. device_attempts se borra después, con
-- 20261101130000_drop_device_attempts.sql (la API anterior la sigue usando).

-- Tipo de credencial que informa WebAuthn: multiDevice = sincronizable; backed_up = con respaldo.
-- reauth_at: prueba de reautenticación pendiente (un solo uso) para acciones sensibles del admin.
alter table devices
  add column device_type text check (device_type in ('singleDevice', 'multiDevice')),
  add column backed_up boolean,
  add column reauth_at timestamptz;

alter type webauthn_purpose add value if not exists 'reauth';

create type device_event_kind as enum ('registered', 'verified', 'rejected', 'reauth', 'reset');

-- Auditoría de la passkey: registro, ingresos, rechazos, reautenticaciones y restablecimientos.
-- actor_id = admin que restableció (null en el resto).
create table device_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users (id) on delete cascade,
  kind device_event_kind not null,
  label text,
  ip text,
  actor_id uuid references users (id) on delete set null,
  at timestamptz not null default now()
);
create index device_events_user_idx on device_events (user_id, at desc);

-- RLS sin políticas y sin permisos para la Data API, como el resto del esquema.
alter table device_events enable row level security;
revoke all on device_events from anon, authenticated;
