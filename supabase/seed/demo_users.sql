-- Usuarios de demostración: uno de cada rol, para entrar con el selector del modo demo
-- (DEMO_MODE=true en la API y VITE_DEMO_MODE=true en la web, ver docs/env.md).
-- Son usuarios reales de la base: lo que se haga en la app los modifica de verdad.
-- No hace falta crearlos en Supabase Auth: en modo demo no se ingresa con mail.
--
-- Se puede correr varias veces (no duplica nada):
--   - Supabase: pegar este archivo en el SQL Editor y ejecutarlo.
--   - Local:    psql postgres://postgres:postgres@localhost:54329/cuidarte -f supabase/seed/demo_users.sql
--
-- Los medicamentos no van acá porque se guardan cifrados con MEDICATIONS_KEY:
-- se cargan desde la app como admin (Pacientes › Medicación).

begin;

insert into users (id, role, email) values
  ('00000000-0000-4000-8000-0000000000a1', 'admin', 'admin@demo.cuidarte'),
  ('00000000-0000-4000-8000-0000000000c1', 'caregiver', 'cuidadora@demo.cuidarte'),
  ('00000000-0000-4000-8000-0000000000b1', 'patient', null)
on conflict (id) do nothing;

insert into admins (user_id, first_name, last_name, email, mobile)
values ('00000000-0000-4000-8000-0000000000a1', 'Ana', 'Administradora', 'admin@demo.cuidarte', '1150000001')
on conflict (user_id) do nothing;

insert into caregivers (user_id, first_name, last_names, phone, email, birth_date)
values ('00000000-0000-4000-8000-0000000000c1', 'Carla', 'Cuidadora', '1150000002', 'cuidadora@demo.cuidarte', '1988-05-14')
on conflict (user_id) do nothing;

insert into patients (user_id, first_name, last_name)
values ('00000000-0000-4000-8000-0000000000b1', 'Pedro', 'Paciente')
on conflict (user_id) do nothing;

insert into caregiver_patients (caregiver_id, patient_id)
values ('00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-0000000000b1')
on conflict do nothing;

-- Tareas del día de Pedro (solo si todavía no tiene ninguna).
insert into task_templates (patient_id, text, time)
select '00000000-0000-4000-8000-0000000000b1', t.text, t.time::time
from (values ('Tomar la presión', '09:00'), ('Caminata corta', '17:00'), ('Revisar hidratación', null))
  as t(text, time)
where not exists (
  select 1 from task_templates where patient_id = '00000000-0000-4000-8000-0000000000b1'
);

-- Turnos de Carla con Pedro: hoy, mañana y en 3 días (hora de Argentina).
-- "on conflict do nothing" también evita superponerse con turnos ya cargados.
insert into shifts (caregiver_id, patient_id, date, start_time, end_time)
select '00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-0000000000b1',
       (now() at time zone 'America/Argentina/Buenos_Aires')::date + s.days, s.start_time::time, s.end_time::time
from (values (0, '08:00', '14:00'), (1, '14:00', '20:00'), (3, '08:00', '14:00'))
  as s(days, start_time, end_time)
where not exists (
  select 1 from shifts where caregiver_id = '00000000-0000-4000-8000-0000000000c1'
)
on conflict do nothing;

commit;
