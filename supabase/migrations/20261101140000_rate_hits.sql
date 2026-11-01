-- Una sola tabla para los límites de pedidos (registro por IP, canje de códigos y contacto por
-- usuario). Solo agrega: se ejecuta ANTES del deploy de la API nueva. Las tablas que reemplaza
-- (signup_attempts, link_attempts, contact_messages) se borran después, con
-- 20261101150000_drop_obsolete.sql.
create table rate_hits (
  key text not null,
  at timestamptz not null default now()
);
create index rate_hits_key_idx on rate_hits (key, at);

-- RLS sin políticas y sin permisos para la Data API, como el resto del esquema.
alter table rate_hits enable row level security;
revoke all on rate_hits from anon, authenticated;
