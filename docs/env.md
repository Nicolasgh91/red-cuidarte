# Variables de entorno

Solo nombres y para qué sirven. **Nunca** valores en el repo: van en GitHub Secrets y en las variables de entorno de Vercel (separadas para Preview y Production). Local: `apps/api/.env.local` y `apps/web/.env.local` (ignorados por git).

## Proyecto Vercel `api` (`apps/api`)

| Variable                                           | Para qué                                                                                                                                                                                                                | Cómo generarla / de dónde sale                                                                                                                                                             |
| -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `DATABASE_URL`                                     | Conexión a Postgres **por el pooler** de Supabase (modo transacción)                                                                                                                                                    | Supabase › Connect › Transaction pooler                                                                                                                                                    |
| `SUPABASE_URL`                                     | Valida el JWT (JWKS) y administra usuarios de Auth                                                                                                                                                                      | Supabase › Settings › API                                                                                                                                                                  |
| `SUPABASE_SERVICE_ROLE_KEY`                        | Alta y baja de usuarios de Auth desde la API. **Solo vive en la API**                                                                                                                                                   | Supabase › Settings › API                                                                                                                                                                  |
| `MEDICATIONS_KEY`                                  | Cifrado AES-256-GCM de `medications` (32 bytes en base64)                                                                                                                                                               | `openssl rand -base64 32`. Si se pierde, la medicación no se puede leer: guardarla también en un gestor de contraseñas                                                                     |
| `DEVICE_TOKEN_SECRET`                              | Firma del token de dispositivo (passkey verificada)                                                                                                                                                                     | `openssl rand -base64 48`                                                                                                                                                                  |
| `CRON_SECRET`                                      | Vercel Cron lo manda como `Authorization: Bearer` a `/internal/jobs/daily`                                                                                                                                              | `openssl rand -base64 24`                                                                                                                                                                  |
| `ALLOWED_ORIGINS`                                  | CORS, separados por coma: `https://redasistir.online,capacitor://localhost,https://localhost`                                                                                                                           | —                                                                                                                                                                                          |
| `WEBAUTHN_RP_ID`                                   | `redasistir.online`                                                                                                                                                                                                     | —                                                                                                                                                                                          |
| `WEBAUTHN_RP_NAME`                                 | Nombre visible en el diálogo de la passkey (default `Cuidarte+`)                                                                                                                                                        | —                                                                                                                                                                                          |
| `WEBAUTHN_ORIGINS`                                 | Orígenes válidos para WebAuthn, separados por coma: `https://redasistir.online` y, para la app Android, `android:apk-key-hash:<hash>`                                                                                   | El hash sale del certificado de firma (ver `docs/assetlinks.md`)                                                                                                                           |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` | Casilla `avisos@redasistir.online` en DonWeb (465 TLS o 587 STARTTLS)                                                                                                                                                   | Panel de DonWeb                                                                                                                                                                            |
| `SMTP_FROM`                                        | Remitente (default `Cuidarte+ <avisos@redasistir.online>`)                                                                                                                                                              | —                                                                                                                                                                                          |
| `GROQ_API_KEY`                                     | Asistente                                                                                                                                                                                                               | console.groq.com                                                                                                                                                                           |
| `GROQ_MODEL`                                       | Modelo (default `openai/gpt-oss-120b`)                                                                                                                                                                                  | Ver `docs/free-tier.md`                                                                                                                                                                    |
| `DEMO_MODE`                                        | `true` = modo demo: `GET /demo/users` lista los usuarios de la base y se entra como cualquiera sin mail ni passkey (los cambios quedan en esa cuenta). No se mandan mails ni se crean usuarios en Auth. Default `false` | Solo para presentaciones: cualquiera puede entrar como cualquiera, **nunca con datos reales**. Va junto con `VITE_DEMO_MODE` en `web`. Usuarios de ejemplo: `supabase/seed/demo_users.sql` |

Para desarrollo local, `DATABASE_URL` puede apuntar al Postgres de `docker-compose` (`postgres://postgres:postgres@localhost:54329/cuidarte`).

## Proyecto Vercel `web` (`apps/web`, variables de build)

| Variable                 | Para qué                                                                                                 |
| ------------------------ | -------------------------------------------------------------------------------------------------------- |
| `VITE_API_URL`           | `https://api.redasistir.online`                                                                          |
| `VITE_SUPABASE_URL`      | URL del proyecto de Supabase                                                                             |
| `VITE_SUPABASE_ANON_KEY` | Clave anon (pública por diseño: la Data API no expone nada, ver RLS)                                     |
| `VITE_DEMO_MODE`         | `true` = el ingreso muestra un selector con los usuarios de la base (requiere `DEMO_MODE=true` en `api`) |

## Configuración de Supabase Auth (👤, en el panel)

- **Ingreso por código de mail:** Authentication › Providers › Email: activar, **desactivar "Confirm email"** no hace falta (los usuarios los crea la API ya confirmados) y **desactivar registros abiertos** (Allow new users to sign up = off).
- **Plantilla del mail "Magic Link"/OTP:** debe incluir `{{ .Token }}` (el código de 6 dígitos).
- **SMTP propio:** Authentication › SMTP Settings con la casilla de DonWeb. El SMTP por defecto de Supabase tiene un tope de envíos muy bajo y no sirve para producción.

## GitHub Secrets (Actions)

| Secret                      | Usado por                                                                                                           |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `SUPABASE_ACCESS_TOKEN`     | `migrate.yml` (token personal de Supabase)                                                                          |
| `SUPABASE_PROJECT_REF_PROD` | `migrate.yml`                                                                                                       |
| `SUPABASE_DB_PASSWORD_PROD` | `migrate.yml`                                                                                                       |
| `BACKUP_DATABASE_URL`       | `backup.yml` (conexión directa o por _session pooler_, **no** transaction pooler, porque `pg_dump` necesita sesión) |
| `BACKUP_PASSPHRASE`         | `backup.yml` (cifra el volcado; guardarla también fuera de GitHub)                                                  |

Crear el Environment `production` en GitHub (Settings › Environments) para `migrate.yml` y `backup.yml`.

## Tests

| Variable            | Para qué                                                                                                 |
| ------------------- | -------------------------------------------------------------------------------------------------------- |
| `TEST_DATABASE_URL` | Base de pruebas (default: Postgres de docker-compose, base `cuidarte_test`). En CI la define el workflow |
