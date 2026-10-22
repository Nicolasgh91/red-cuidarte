Cuidarte+ — especificación v2

Fuente de verdad para el desarrollo. El prototipo (artifact "Cuidarte+", v2) implementa el frontend con datos locales; todo lo marcado como Backend no existe todavía. El plan de ejecución está en claude/cuidarte-roadmap.md.

Stack (cerrado)
Capa	Decisión
Repo	https://github.com/Nicolasgh91/red-cuidarte (privado, monorepo pnpm)
Dominio	redasistir.online (DNS en DonWeb)
Front	React + Vite + TypeScript
Apps de tienda	Capacitor sobre el mismo front. Android primero; iOS cuando se pague Apple Developer
Web	Vercel (plan Hobby) → redasistir.online, instalable como PWA
Back	TypeScript + Hono sobre Vercel Functions (Node.js), proyecto Vercel aparte → api.redasistir.online. Sin Java ni servidores propios
Base de datos y auth	Supabase (Postgres + Auth): cuidarte-prod y cuidarte-dev. La API accede por el pooler
Acceso a datos	postgres (postgres.js), SQL escrito a mano, validación con Zod
Migraciones	Supabase CLI (supabase/migrations), aplicadas a producción solo desde CI
WebAuthn	@simplewebauthn/server
LLM del asistente	Groq (free tier)
Mails	Nodemailer con el SMTP de la casilla avisos@redasistir.online en DonWeb
Tareas programadas	Vercel Cron (Hobby: una vez por día, precisión por hora) → endpoint interno protegido
Despliegue	Integración Git de Vercel (web y api). GitHub Actions: CI, migraciones y backup semanal
Recordatorios	Notificaciones locales del dispositivo (Capacitor Local Notifications), sin servidor
Costo	US$ 0 de infraestructura. Únicos costos: Google Play US$ 25 una vez y Apple Developer US$ 99/año (iOS, en espera)
Decisiones cerradas
Un dispositivo por cuenta (device binding): la verificación por MAC no es posible (los navegadores no exponen la MAC) y la IP no sirve para identificar (CGNAT en redes móviles, DHCP, cambios wifi/datos). Se usa una credencial ligada al dispositivo: passkey WebAuthn registrada en el primer ingreso. La IP se guarda solo como log de auditoría. Un ingreso desde otro dispositivo queda bloqueado hasta que el admin libere o autorice.
Administradores: se cargan directamente en la base de datos. No hay UI para crear admins.
Medicación = dato sensible de salud (Ley 25.326): visible solo para admin y cuidadores asignados; consentimiento de la persona cuidada o su representante; cifrado en reposo.
Registro de bienestar: lo ve solo el cuidador. El admin y el asistente no acceden.
Asistente IA: Groq free tier (no usa los datos para entrenar). Se alimenta de recursos de la app, FAQ, turnos del cuidador, pacientes asignados y su medicación. Sin búsqueda web, sin diagnósticos. Herramientas: listar_turnos, agregar_turnos. Límite: 20 mensajes por usuario por día.
Tema: claro / oscuro / sistema, preferencia por dispositivo.
Acceso a datos: solo la API accede a Postgres. La Data API pública de Supabase queda sin permisos para anon y authenticated (RLS activado, sin políticas).
MCP de Supabase: conectado solo a cuidarte-dev. Producción no se expone a agentes.
Backend sin estado: al correr en funciones sin proceso persistente, nada se guarda en memoria. Límites del asistente, desafíos de WebAuthn y control de envíos viven en la base.
Hosting: Vercel Hobby para web y API (D2 del roadmap). Hobby es solo para uso no comercial: si el proyecto pasa a ser comercial, se migra a Pro antes de lanzar.
Roles
Rol	Ve	Puede
caregiver	Inicio, Turnos, Tareas, Asistente, Bienestar, Pausa, Recursos, Perfil	Cargar turnos (manual o por chat), tildar tareas, agregar tareas diarias, registrar bienestar, configurar recordatorios
admin (Jorge)	Panel, Cuidadores, Pacientes, Dispositivos, Correos	Alta de cuidadores y pacientes, asignaciones, medicación, liberar/autorizar dispositivos
patient	Hoy (quién lo cuida, medicación del día, urgencia)	Solo lectura
Modelo de datos (Backend)
users(id UUID = auth.users.id, role ENUM('caregiver','admin','patient'), email UNIQUE NULL, created_at)
caregivers(user_id PK/FK, first_name, last_names, phone, email, birth_date)
admins(user_id PK/FK, first_name, last_name, email, mobile)          -- seed por SQL
patients(user_id PK/FK, first_name, last_name)
medications(id, patient_id FK, name, dose, times TIME[])             -- cifrado en reposo
caregiver_patients(caregiver_id FK, patient_id FK, PK(caregiver_id, patient_id))
shifts(id, caregiver_id FK, patient_id FK, date, start_time, end_time, source ENUM('manual','assistant'))
  -- sin superposición por cuidador (validar en servicio; turnos que cruzan medianoche permitidos)
task_templates(id, patient_id FK, text, time NULL)
task_completions(date, patient_id, task_key, caregiver_id, done_at, PK(date, patient_id, task_key))
  -- task_key = template id o "med-{medication_id}-{HH:MM}"
wellbeing_records(id, caregiver_id FK, at, mood SMALLINT, energy SMALLINT, stress SMALLINT, note)  -- escala 0–4
reminder_settings(caregiver_id PK, water JSONB, stretch JSONB, relax JSONB)
devices(user_id PK/FK, credential_id, public_key, sign_count, label, last_ip, last_seen_at, registered_at)
device_attempts(id, user_id, label, ip, at, status ENUM('blocked','authorized'))
webauthn_challenges(user_id, challenge, purpose ENUM('register','login'), expires_at)
mail_log(id, to_email, subject, kind ENUM('birthday','test'), sent_at, status, error, UNIQUE(to_email, kind, year))
assistant_usage(caregiver_id, date, messages, PK(caregiver_id, date))
Requerimientos
Casilla DonWeb: avisos@redasistir.online; credenciales SMTP en variables de entorno de Vercel; SPF, DKIM y DMARC en el DNS; mail de prueba.
Roles: ver tabla.
Datos de usuarios: ver modelo.
Un dispositivo por cuenta: ver decisión. Pantallas: admin › Dispositivos (estado, última IP, liberar, autorizar nuevo).
Cumpleaños: Vercel Cron diario a las 12:00 UTC → endpoint interno → cuidadores con cumpleaños hoy → mail → mail_log. En Hobby el cron dispara entre las 09:00 y las 09:59 hora AR. Idempotente por (mail, tipo, año).
Asistente + turnos: el cuidador cuenta sus turnos en lenguaje natural → el modelo resuelve fechas → agregar_turnos valida paciente asignado, formato y superposición → confirma en el chat con opción Deshacer. Cada turno exportable a Google Calendar.
Historial de estados: vista diaria (lista) y semanal (promedios de ánimo/energía/estrés + ánimo por día).
Recordatorios: agua y estiramientos (frecuencia + ventana horaria), pausa de relajación (hasta 3 horarios). Se programan como notificaciones locales en el dispositivo; la configuración se guarda en reminder_settings para restaurarla. En la web (y en iPhone mientras no haya app iOS) los avisos aparecen solo con la app abierta.
Checklist diario por paciente: se genera cada día desde task_templates + tomas de medications. Progreso por paciente.
Modo light / dark / system.
Fuera de alcance de esta versión

Sincronización automática con Google Calendar, compartir ubicación, app iOS hasta que se pague Apple Developer.