# Operación

Todo lo que hace falta para desplegar y mantener Cuidarte+: variables, Vercel, Supabase, correo, límites de los planes gratuitos. Lo que falta, las pruebas con servicios reales y el checklist de lanzamiento están en [`pendientes.md`](pendientes.md). La arquitectura está en [`architecture.md`](architecture.md); DNS en [`dns.md`](dns.md); Android en [`android.md`](android.md).

## Variables de entorno

Solo nombres. **Nunca** valores en el repo: van en Vercel (Settings › Environment Variables, Preview y Production por separado) y en GitHub Secrets. Local: `apps/api/.env.local` y `apps/web/.env.local` (ignorados por git). Se aplican en un deploy nuevo: después de cambiarlas, **Deployments › ⋯ › Redeploy**.

### API (proyecto Vercel `red-cuidarte`, raíz `apps/api`)

Todas son obligatorias salvo las que tienen default: si falta una, la API no arranca (500 `FUNCTION_INVOCATION_FAILED`). Se validan en [`apps/api/src/env.ts`](../apps/api/src/env.ts).

| Variable                                           | Para qué                                                                                                                                                                                                                              | De dónde sale                                                                                        |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`                                     | Postgres **por el pooler** de Supabase, modo transacción (puerto 6543). Local: `postgres://postgres:postgres@localhost:54329/cuidarte`                                                                                                | Supabase › Connect › Transaction pooler                                                              |
| `SUPABASE_URL`                                     | Valida el JWT (JWKS) y administra usuarios de Auth                                                                                                                                                                                    | Supabase › Settings › API                                                                            |
| `SUPABASE_SERVICE_ROLE_KEY`                        | Alta y baja de usuarios de Auth. **Solo vive en la API**                                                                                                                                                                              | Supabase › API Keys › `service_role`                                                                 |
| `MEDICATIONS_KEY`                                  | Cifrado AES-256-GCM de `medications` (32 bytes en base64)                                                                                                                                                                             | `openssl rand -base64 32`. **Guardarla también en un gestor**: si se pierde, la medicación no se lee |
| `DEVICE_TOKEN_SECRET`                              | Firma del token de la passkey                                                                                                                                                                                                         | `openssl rand -base64 48`                                                                            |
| `CRON_SECRET`                                      | Vercel Cron lo manda como `Authorization: Bearer` a `/internal/jobs/daily`                                                                                                                                                            | `openssl rand -base64 24`                                                                            |
| `ALLOWED_ORIGINS`                                  | CORS, separados por coma y **sin `/` final**: `https://redasistir.online,https://localhost`                                                                                                                                           | —                                                                                                    |
| `NATIVE_ORIGINS`                                   | Orígenes de la app nativa (`https://localhost,capacitor://localhost`): solo a ellos se les devuelve el token en el cuerpo y se acepta `X-Device-Token`                                                                                | —                                                                                                    |
| `WEBAUTHN_RP_ID`                                   | Solo el dominio: `redasistir.online` (sin `https://` ni `/`)                                                                                                                                                                          | —                                                                                                    |
| `WEBAUTHN_RP_NAME`                                 | Nombre en el diálogo de la passkey (default `Cuidarte+`)                                                                                                                                                                              | —                                                                                                    |
| `WEBAUTHN_ORIGINS`                                 | Exacto como lo ve el navegador: `https://redasistir.online` (sin `www`) y, para Android, `android:apk-key-hash:<hash>`. Cada origen web tiene que estar bajo `WEBAUTHN_RP_ID`; si no, la API no arranca y el error nombra la variable | Ver [`android.md`](android.md#passkeys-y-assetlinksjson)                                             |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` | Casilla `info@redasistir.online` en DonWeb (465 TLS o 587 STARTTLS; default 465)                                                                                                                                                      | Panel de DonWeb                                                                                      |
| `SMTP_FROM`                                        | Remitente y destino del formulario de contacto (default `Cuidarte+ <info@redasistir.online>`)                                                                                                                                         | —                                                                                                    |
| `GROQ_API_KEY`                                     | Asistente                                                                                                                                                                                                                             | console.groq.com › API Keys                                                                          |
| `GROQ_MODEL`                                       | Modelo (default `openai/gpt-oss-120b`)                                                                                                                                                                                                | —                                                                                                    |

Verificación: `https://red-cuidarte.vercel.app/health` → `{"ok":true}`. Cambiar una variable no toca los deploys existentes: después hay que hacer **Redeploy**.

### Web (proyecto Vercel `red-cuidarte-web`, raíz `apps/web`; se leen al compilar)

| Variable                 | Para qué                                                                                                                   |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| `VITE_API_URL`           | `/api` en la web (el rewrite de `apps/web/vercel.json` la manda a la API: mismo origen, sin CORS). URL absoluta en Android |
| `VITE_SUPABASE_URL`      | URL del proyecto de Supabase                                                                                               |
| `VITE_SUPABASE_ANON_KEY` | Clave anon (pública por diseño: la Data API no expone nada, ver RLS)                                                       |

### GitHub Secrets y tests

| Nombre                | Usado por                                                                                                   |
| --------------------- | ----------------------------------------------------------------------------------------------------------- |
| `BACKUP_DATABASE_URL` | `backup.yml`: conexión directa o _session pooler_ (**no** el de transacción: `pg_dump` necesita sesión)     |
| `BACKUP_PASSPHRASE`   | `backup.yml`: cifra el volcado. Guardarla también fuera de GitHub                                           |
| `TEST_DATABASE_URL`   | Tests de la API (default: base `cuidarte_test` del Postgres de docker-compose; en CI la define el workflow) |

Crear el Environment `production` en GitHub (Settings › Environments) para `backup.yml`.

## Vercel

| Proyecto           | Raíz       | URL                                   |
| ------------------ | ---------- | ------------------------------------- |
| `red-cuidarte`     | `apps/api` | `https://red-cuidarte.vercel.app`     |
| `red-cuidarte-web` | `apps/web` | `https://red-cuidarte-web.vercel.app` |

- La web llama a `/api/...` en su propio dominio y un rewrite la reenvía a la API: si cambia el dominio de la API, hay que cambiar ese rewrite.
- La función de la API corre en `cle1` (Cleveland), cerca de Supabase `us-east-2` (`apps/api/vercel.json`). Hobby permite **una sola región**.
- No usar las URLs por deploy (`<proyecto>-<hash>...`) en la configuración: cambian en cada deploy.

## Supabase

- **Dos proyectos:** `cuidarte-prod` y `cuidarte-dev`. El MCP de Supabase se conecta solo a dev (prod tiene datos de salud).
- **Auth:** Providers › Email activado; **Allow new users to sign up = off** (las cuentas las crea la API ya confirmadas). Contraseñas de **8+ caracteres**. Plantilla «Reset password» con `{{ .Token }}` (código de 6 dígitos, sin enlaces). SMTP propio (el de Supabase tiene un tope muy bajo).
- **Migraciones:** se ejecutan **a mano** en el editor SQL, en orden y respetando el comentario de cabecera de cada archivo. Las que borran algo dicen «después del deploy»: primero se agrega, después se despliega la API y recién entonces se borra.
- **Admins:** se cargan por SQL ([`supabase/seed/admin_jorge.sql`](../supabase/seed/admin_jorge.sql)). Para restablecer la passkey de un admin sin otro admin: `delete from devices where user_id = (select id from users where email = '<mail>' and role = 'admin');`.

## Correo (DonWeb)

1. Crear la casilla `info@redasistir.online` en el panel de DonWeb y cargar sus datos en `SMTP_*`.
2. Configurar SPF, DKIM y DMARC para mejorar la entregabilidad (procedimiento en [`dns.md`](dns.md#correo-inforedasistironline)).
3. Configurar la misma casilla como SMTP de Supabase Auth (códigos de recuperación).
4. Desde **Admin › Correos**, enviar un mail de prueba y comprobar que llegue a la bandeja de entrada ([`dns.md`](dns.md#verificación-del-correo)).

## Límites de los planes gratuitos

Relevados el 2026-10-22: volver a verificar antes de lanzar.

| Servicio                 | Límite que importa                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Vercel Hobby             | 1 M invocaciones y 4 h de CPU activa por mes; funciones de hasta 300 s; una región; cron una vez por día con precisión de una hora; logs por **1 hora**; **prohibido el uso comercial** (si pasa a serlo, Pro a US$ 20/mes); no admite repos de organizaciones                                                                                                                                                                                                           |
| Groq                     | **8.000 tokens/min (TPM), 200.000 tokens/día (TPD), 30 pedidos/min (RPM) y 1.000 pedidos/día (RPD)** para toda la organización. El contexto fijo pesa ~2.200 tokens (estimado; medir con `eval:assistant`). Groq lo cachea y los tokens cacheados no cuentan para el límite, pero el caché no está garantizado. Cargar o listar turnos usa una sola llamada y las urgencias no llaman a Groq. El límite propio de 20 mensajes por usuario y por día no protege este tope |
| Supabase Free            | 500 MB de base, 5 GB de egress, 50.000 usuarios de Auth por mes, 2 proyectos. **Se pausa tras 7 días sin actividad** (el cron diario lo evita: si falla una semana, se pausa producción)                                                                                                                                                                                                                                                                                 |
| GitHub Actions (privado) | 2.000 min/mes, 500 MB de artifacts (los backups se guardan 21 días)                                                                                                                                                                                                                                                                                                                                                                                                      |

**Si el asistente falla:** buscar `assistant llm` en los logs de Vercel (se guardan 1 hora): trae el status, el código de Groq y, en un 429, qué tope se alcanzó (`limit`: `TPM`, `TPD`, `RPM` o `RPD`). 401 → rotar `GROQ_API_KEY`; 404 o `model_decommissioned` → cambiar `GROQ_MODEL`; 429 `TPM` o 413 frecuentes → tope de tokens por minuto de la cuenta; 429 `TPD` o `RPD` → se acabó el cupo del día. Los 429 cortos y los 5xx se reintentan una vez si entran en el plazo de 17 s.

**Si el correo falla** (mail de prueba, Contacto o cumpleaños): el motivo queda en el historial de Admin › Correos (columna Estado) y en los logs de Vercel como `mail` (`kind`, `code`, `host`, `port`; nunca el mensaje ni la clave). El mail de prueba responde 502 `mail_failed` con qué revisar.

| `kind`     | Causa                                         | Qué tocar                                                                                    |
| ---------- | --------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `dns`      | El host no se resuelve (`ENOTFOUND`, `EBUSY`) | `SMTP_HOST` (p. ej. un valor de ejemplo como `demo` en vez del servidor de DonWeb); redeploy |
| `connect`  | Rechazó o cortó la conexión                   | `SMTP_PORT` (465 o 587) y que DonWeb permita salida desde Vercel                             |
| `timeout`  | No respondió a tiempo                         | Reintentar; si sigue, estado de DonWeb                                                       |
| `tls`      | Falló el cifrado                              | `SMTP_PORT`: 465 es TLS directo, 587 es STARTTLS                                             |
| `auth`     | Usuario o clave rechazados                    | `SMTP_USER` y `SMTP_PASS` (la casilla completa, `info@redasistir.online`)                    |
| `rejected` | El servidor rechazó el mensaje                | Dirección de destino y `SMTP_FROM`                                                           |

`EBUSY`, `EAI_AGAIN` y `ETIMEDOUT` se reintentan una vez. Contacto responde 503 `mail_unavailable` ante `dns`, `tls` y `auth` (reintentar no sirve) y 502 `mail_failed` en el resto. El cron suma `failed_by_kind` a su respuesta. Los códigos de recuperación de contraseña salen por el SMTP de Supabase Auth, que se configura aparte: si «Enviarme el código» falla, revisar el host también ahí.

**Consumo del asistente:** cada consulta deja en los logs una línea `assistant usage`, sin texto ni datos personales:

- `path`: `emergency` (respondida sin Groq), `llm`, `tool_rendered` (respuesta armada por la API con el resultado de una herramienta) o `error`.
- `calls`, `prompt`, `cached` y `completion`: llamadas a Groq y tokens, sumados.
- `effective` = `prompt − cached + completion`: lo que cuenta para el límite. `cache_hit` = `cached / prompt`.
- `ms` y `finish` (`length` indica que se cortó la salida).
- `limits`: los headers `x-ratelimit-*` de la última llamada. En Groq, `remaining-requests` es el cupo de pedidos **del día** (RPD) y `remaining-tokens` el de tokens **del minuto** (TPM). TPD y RPM no vienen en los headers: solo aparecen en el 429. Si Groq agrega headers separados de entrada y salida (ITPM/OTPM), también quedan acá.

## Pruebas con servicios reales y lanzamiento

Las pruebas pendientes con servicios reales y el checklist de lanzamiento están en [`pendientes.md`](pendientes.md#8-pruebas-con-servicios-reales).
