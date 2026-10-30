-- Autorregistro de cuidadores (POST /signup, público): intentos por IP para limitar altas en masa.
create table signup_attempts (
  id uuid primary key default gen_random_uuid(),
  ip text not null,
  at timestamptz not null default now()
);
create index signup_attempts_ip_idx on signup_attempts (ip, at);

-- RLS sin políticas y sin permisos para la Data API, como el resto del esquema.
alter table signup_attempts enable row level security;
revoke all on signup_attempts from anon, authenticated;
