-- Contacto: mensajes del formulario y nuevo tipo de mail en mail_log.
-- mail_log ya tiene la unicidad solo para cumpleaños (índice parcial mail_log_birthday_once),
-- así que los mails 'contact' se pueden repetir sin tocar nada más.
alter type mail_kind add value if not exists 'contact';

create type contact_status as enum ('sent', 'failed');

create table contact_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users (id) on delete cascade,
  subject text not null default '' check (char_length(subject) <= 100),
  message text not null check (char_length(message) between 1 and 2000),
  created_at timestamptz not null default now(),
  status contact_status not null,
  error text
);
-- Cuenta de mensajes por usuario en las últimas 24 h (límite de 3).
create index contact_messages_user_idx on contact_messages (user_id, created_at);

-- RLS sin políticas y sin permisos para la Data API, como el resto del esquema.
alter table contact_messages enable row level security;
revoke all on contact_messages from anon, authenticated;
