# Cuidarte+ — especificación funcional

Qué hace la app y con qué reglas. Cómo está construida: [`architecture.md`](architecture.md). Cómo se opera: [`ops.md`](ops.md).

## Stack (cerrado)

| Capa                 | Decisión                                                                                                                           |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Repo                 | https://github.com/Nicolasgh91/red-cuidarte (privado, monorepo pnpm)                                                               |
| Dominio              | redasistir.online (DNS en DonWeb)                                                                                                  |
| Front                | React + Vite + TypeScript                                                                                                          |
| Apps de tienda       | Capacitor sobre el mismo front. Android primero; iOS cuando se pague Apple Developer                                               |
| Web                  | Vercel (plan Hobby) → redasistir.online, instalable como PWA                                                                       |
| Back                 | TypeScript + Hono sobre Vercel Functions (Node.js), proyecto Vercel aparte → api.redasistir.online. Sin Java ni servidores propios |
| Base de datos y auth | Supabase (Postgres + Auth): cuidarte-prod y cuidarte-dev. La API accede por el pooler                                              |
| Acceso a datos       | postgres (postgres.js), SQL escrito a mano, validación con Zod                                                                     |
| Migraciones          | SQL en supabase/migrations, aplicadas a mano en el editor SQL de Supabase (sin CI)                                                 |
| WebAuthn             | @simplewebauthn/server                                                                                                             |
| LLM del asistente    | Groq (free tier)                                                                                                                   |
| Mails                | Nodemailer con el SMTP de la casilla info@redasistir.online en DonWeb                                                              |
| Tareas programadas   | Vercel Cron (Hobby: una vez por día, precisión por hora) → endpoint interno protegido                                              |
| Despliegue           | Integración Git de Vercel (web y api). GitHub Actions: CI y backup semanal                                                         |
| Recordatorios        | Notificaciones locales del dispositivo (Capacitor Local Notifications), sin servidor                                               |
| Costo                | US$ 0 de infraestructura. Únicos costos: Google Play US$ 25 una vez y Apple Developer US$ 99/año (iOS, en espera)                  |

## Decisiones cerradas

- **Una passkey por cuenta como segundo factor** (ver [`architecture.md`](architecture.md#9-decisiones-vigentes)): no se puede identificar el equipo físico (los navegadores no exponen la MAC, la IP no sirve por CGNAT, DHCP y cambios de wifi/datos, y una passkey sincronizada sirve en varios equipos). Se registra en el primer ingreso y funciona desde cualquier equipo donde esté (sincronizada o desde el teléfono con QR). Se usa siempre con verificación de usuario (huella, rostro o PIN). Registrar otra requiere que el admin restablezca la actual. La última IP se guarda solo como registro.
- **Administradores:** se cargan directamente en la base de datos. No hay UI para crear admins.
- **Medicación = dato sensible de salud (Ley 25.326):** visible solo para el admin y los cuidadores asignados; consentimiento de la persona cuidada o su representante; cifrado en reposo.
- **Registro de bienestar:** lo ve solo el cuidador. El admin y el asistente no acceden.
- **Asistente IA:** Groq free tier (no usa los datos para entrenar). Se alimenta de los recursos de la app, la FAQ, los turnos del cuidador, sus pacientes asignados y su medicación. Sin búsqueda web, sin diagnósticos. Herramientas: `listar_turnos`, `agregar_turnos`. Límite: 20 mensajes por usuario por día.
- **Tema:** claro / oscuro / sistema, preferencia por dispositivo.
- **Acceso a datos:** solo la API accede a Postgres. La Data API pública de Supabase queda sin permisos para `anon` y `authenticated` (RLS activado, sin políticas).
- **MCP de Supabase:** conectado solo a cuidarte-dev. Producción no se expone a agentes.
- **Backend sin estado:** nada se guarda en memoria. Límites, desafíos de WebAuthn y control de envíos viven en la base.
- **Hosting:** Vercel Hobby para web y API. Hobby es solo para uso no comercial: si el proyecto pasa a ser comercial, se migra a Pro antes de lanzar.

## Roles

| Rol           | Ve                                                                    | Puede                                                                                                                   |
| ------------- | --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| caregiver     | Inicio, Turnos, Tareas, Asistente, Bienestar, Pausa, Recursos, Perfil | Cargar turnos (a mano o por chat), tildar tareas, agregar tareas diarias, registrar bienestar, configurar recordatorios |
| admin (Jorge) | Panel, Cuidadores, Pacientes, Passkeys, Correos, Contenido            | Alta de cuidadores y pacientes, asignaciones, medicación, restablecer passkeys, editar los textos de la web             |
| patient       | Hoy (quién lo cuida, medicación del día, urgencia)                    | Solo lectura; compartir su código para vincularse con un cuidador                                                       |

## Modelo de datos

```
users(id UUID = auth.users.id, role ENUM('caregiver','admin','patient'), email UNIQUE NULL, created_at)
caregivers(user_id PK/FK, first_name, last_names, phone, email, birth_date)
admins(user_id PK/FK, first_name, last_name, email, mobile)          -- seed por SQL
patients(user_id PK/FK, first_name, last_name, link_code UNIQUE NULL, link_code_expires_at NULL)
  -- código de un solo uso (48 h) para vincularse con un cuidador
medications(id, patient_id FK, name, dose, times TIME[])             -- name y dose cifrados
caregiver_patients(caregiver_id FK, patient_id FK, PK(caregiver_id, patient_id))
shifts(id, caregiver_id FK, patient_id FK, date, start_time, end_time, source ENUM('manual','assistant'))
  -- sin superposición por cuidador; los turnos pueden cruzar la medianoche
task_templates(id, patient_id FK, text, time NULL)
task_completions(date, patient_id, task_key, caregiver_id, done_at, PK(date, patient_id, task_key))
  -- task_key = id de la plantilla o "med-{medication_id}-{HH:MM}"
wellbeing_records(id, caregiver_id FK, at, mood SMALLINT, energy SMALLINT, stress SMALLINT, note)  -- escala 0–4
reminder_settings(caregiver_id PK, water JSONB, stretch JSONB, relax JSONB)
devices(user_id PK/FK, credential_id, public_key, sign_count, label, device_type, backed_up,
        last_ip, last_seen_at, registered_at)
webauthn_challenges(user_id, challenge, purpose ENUM('register','login'), expires_at)
mail_log(id, to_email, subject, kind ENUM('birthday','test','contact'), year, sent_at, status, error)
  -- UNIQUE(to_email, kind, year) solo para 'birthday': los de prueba y contacto se repiten
rate_hits(key, at)                   -- límites: registro por IP, canje de códigos y contacto por usuario
assistant_usage(caregiver_id, date, messages, PK(caregiver_id, date))
site_content(key PK, value JSONB, updated_at, updated_by)  -- textos que edita el admin; sin fila vale el original
```

## Requerimientos

- **Casilla DonWeb:** info@redasistir.online; credenciales SMTP en variables de entorno de Vercel; SPF, DKIM y DMARC en el DNS; mail de prueba. El remitente (`SMTP_FROM`) es esa misma casilla.
- **Contacto:** el mail info@redasistir.online se muestra como enlace `mailto` (Contacto, pantalla de la passkey e ingreso). Formulario para usuarios con sesión de cualquier rol (Mi perfil, pie de Inicio y menú Mi cuenta; no va en la barra lateral). Campos: asunto (opcional, máx. 100, sin saltos de línea ni caracteres de control) y mensaje (obligatorio, máx. 2000). Se manda a `SMTP_FROM` con `Reply-To` = mail de la cuenta y, en el cuerpo, nombre, rol, id de usuario y mensaje; queda en `mail_log` (kind `contact`, sin el asunto). Límite: 3 mensajes por usuario en 24 horas móviles (en la base); el 4.º recibe 429. El mensaje no se guarda en la base: si el SMTP falla responde 502, queda `failed` en `mail_log` y la pantalla conserva lo escrito para reintentar. El formulario avisa «No incluyas datos de salud ni de medicación en este mensaje.». Fuera de alcance: adjuntos, bandeja de entrada para el admin, captcha y respuestas automáticas.
- **Passkeys:** ver decisión. Pantalla admin › Passkeys: estado, sincronizable / con respaldo, última IP, último uso, restablecer.
- **Cumpleaños:** Vercel Cron diario a las 12:00 UTC → endpoint interno → cuidadores que cumplen hoy → mail → `mail_log`. En Hobby dispara entre las 09:00 y las 09:59 hora AR. Idempotente por (mail, tipo, año).
- **Asistente + turnos:** el cuidador cuenta sus turnos en lenguaje natural → el modelo resuelve las fechas → `agregar_turnos` valida paciente asignado, formato y superposición → confirma en el chat con opción Deshacer. Cada turno se puede exportar a Google Calendar.
- **Historial de estados:** vista diaria (lista) y semanal (promedios de ánimo, energía y estrés + ánimo por día).
- **Recordatorios:** agua y estiramientos (frecuencia + ventana horaria), pausa de relajación (hasta 3 horarios). En Android son notificaciones locales; la configuración se guarda en `reminder_settings`. En la web (y en iPhone mientras no haya app iOS) los avisos aparecen solo con la app abierta.
- **Checklist diario por paciente:** se arma cada día con `task_templates` + tomas de `medications`. Progreso por paciente.
- **Modo claro / oscuro / sistema.**

## Fuera de alcance de esta versión

Sincronización automática con Google Calendar, compartir ubicación y la app iOS hasta que se pague Apple Developer.
