-- Alta del administrador (Jorge). No hay UI para crear admins (spec-v2).
-- 1. Crear el usuario en Supabase Auth (Dashboard › Authentication › Users) y copiar su UUID.
-- 2. Ejecutar con psql, completando los datos reales (no se guardan en el repo):
--
--    psql "$DATABASE_URL" \
--      -v admin_id='<uuid de auth.users>' \
--      -v first_name='Jorge' -v last_name='<apellido>' \
--      -v email='<mail>' -v mobile='<celular>' \
--      -f supabase/seed/admin_jorge.sql
--
-- Producción: lo corre Nico a mano. El agente no escribe en cuidarte-prod.

begin;

insert into users (id, role, email)
values (:'admin_id', 'admin', :'email');

insert into admins (user_id, first_name, last_name, email, mobile)
values (:'admin_id', :'first_name', :'last_name', :'email', :'mobile');

commit;
