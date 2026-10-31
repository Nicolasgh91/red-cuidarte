-- Contenido de la web que edita el admin (frases, recursos, preguntas frecuentes, textos de la
-- landing y páginas). Cada clave guarda el JSON completo; sin fila, se usa el texto original que
-- viene en el código (apps/api/src/content).
create table site_content (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references users (id) on delete set null
);

-- RLS sin políticas y sin permisos para la Data API, como el resto del esquema.
alter table site_content enable row level security;
revoke all on site_content from anon, authenticated;
