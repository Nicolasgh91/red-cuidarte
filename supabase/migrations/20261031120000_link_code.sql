-- Vincular a un paciente con su cuidador/a: el paciente comparte un código de un solo uso y con
-- vencimiento, y el cuidador lo ingresa en la app. Sin código no se puede asignar a nadie.
alter table patients
  add column link_code text unique,
  add column link_code_expires_at timestamptz;

-- Intentos de canje por cuidador/a, para frenar la búsqueda de códigos por fuerza bruta.
create table link_attempts (
  id uuid primary key default gen_random_uuid(),
  caregiver_id uuid not null references users (id) on delete cascade,
  at timestamptz not null default now()
);
create index link_attempts_caregiver_idx on link_attempts (caregiver_id, at);

-- RLS sin políticas y sin permisos para la Data API, como el resto del esquema.
alter table link_attempts enable row level security;
revoke all on link_attempts from anon, authenticated;
