# Configuración de Vercel (checklist)

Hay **dos proyectos** en Vercel, cada uno con su URL y sus variables:

| Proyecto en Vercel                                       | Root Directory | URL                                   |
| -------------------------------------------------------- | -------------- | ------------------------------------- |
| API: `red-cuidarte` (`prj_modaWbefB1aqgIbznK8aAA3RQpWZ`) | `apps/api`     | `https://red-cuidarte.vercel.app`     |
| Web: `red-cuidarte-web`                                  | `apps/web`     | `https://red-cuidarte-web.vercel.app` |

Las variables de la API van en el proyecto `red-cuidarte`.

**Cómo se conectan:** la web llama a la API por su propio dominio, en `https://red-cuidarte-web.vercel.app/api/...`. Un rewrite de `apps/web/vercel.json` reenvía esos pedidos a `https://red-cuidarte.vercel.app`. Así el navegador no hace CORS ni preflight, lo que ahorra una ida y vuelta por pedido. Si cambia el dominio de la API, hay que cambiar ese rewrite.

**Región:** la función de la API corre en `cle1` (Cleveland), la misma zona que Supabase (`us-east-2`), configurada en `apps/api/vercel.json`.

Cada deploy tiene además su propia URL (`<proyecto>-<hash>-...vercel.app`) que cambia cada vez: no usarla en la configuración. Las URLs de arriba apuntan siempre al último deploy de producción.

Las variables se cargan en **Proyecto › Settings › Environment Variables**, entorno **Production**. Solo se aplican en un deploy nuevo: después de cambiarlas, **Deployments › ⋯ › Redeploy**.

Marcar `[x]` a medida que se cargan. Detalle de cada variable: `docs/env.md`.

## Proyecto API

Todas son obligatorias salvo las marcadas como opcionales: si falta una, la API no arranca (500 `FUNCTION_INVOCATION_FAILED`).

| #   | Hecho | Variable                    | Para qué                                                  | Valor / de dónde sale                                                                                          |
| --- | ----- | --------------------------- | --------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| 1   | [x]   | `DATABASE_URL`              | Conexión a la base                                        | Supabase › Connect › Transaction pooler (puerto 6543), con la contraseña de la base                            |
| 2   | [x]   | `SUPABASE_URL`              | Validar el login por mail                                 | `https://iahuyqmgfegtmocrhmdr.supabase.co`                                                                     |
| 3   | [X]   | `SUPABASE_SERVICE_ROLE_KEY` | Crear y borrar usuarios de Supabase Auth                  | Supabase › Project Settings › API Keys › Legacy › `service_role`                                               |
| 4   | [X]   | `MEDICATIONS_KEY`           | Cifrar nombre y dosis de los medicamentos                 | `openssl rand -base64 32`. Guardarla en un gestor de contraseñas: si se pierde, la medicación no se puede leer |
| 5   | [X]   | `DEVICE_TOKEN_SECRET`       | Firmar el token de la passkey                             | `openssl rand -base64 48`                                                                                      |
| 6   | [X]   | `CRON_SECRET`               | Proteger el cron diario (mails de cumpleaños)             | `openssl rand -base64 24`                                                                                      |
| 7   | [X]   | `ALLOWED_ORIGINS`           | CORS: URLs de la web que pueden llamar a la API           | `https://red-cuidarte-web.vercel.app` — **sin `/` al final** (con `/` el navegador bloquea los pedidos)        |
| 8   | [x]   | `WEBAUTHN_RP_ID`            | Dominio de las passkeys                                   | `redasistir.online`                                                                                            |
| 9   | [x]   | `WEBAUTHN_ORIGINS`          | Orígenes válidos para passkeys                            | `https://redasistir.online`                                                                                    |
| 10  | [ ]   | `SMTP_HOST`                 | Servidor de mail                                          | Panel de DonWeb                                                                                                |
| 11  | [ ]   | `SMTP_PORT`                 | Puerto del servidor de mail                               | `465` o `587` (opcional, default `465`)                                                                        |
| 12  | [ ]   | `SMTP_USER`                 | Usuario de la casilla                                     | `avisos@redasistir.online`                                                                                     |
| 13  | [ ]   | `SMTP_PASS`                 | Contraseña de la casilla                                  | Panel de DonWeb                                                                                                |
| 14  | [ ]   | `SMTP_FROM`                 | Remitente de los mails                                    | Opcional, default `Cuidarte+ <avisos@redasistir.online>`                                                       |
| 15  | [x]   | `GROQ_API_KEY`              | Asistente de IA del cuidador                              | console.groq.com › API Keys                                                                                    |
| 16  | [ ]   | `GROQ_MODEL`                | Modelo del asistente                                      | Opcional, default `openai/gpt-oss-120b`. Ver `docs/free-tier.md`                                               |
| 17  | [ ]   | `DEMO_MODE`                 | Selector de usuarios sin mail ni passkey (no manda mails) | `true` para la demo. **Nunca** con datos reales                                                                |

En modo demo no se usan las 5–6 y 8–14 (no hay passkeys, cron ni mails), pero hoy igual tienen que tener un valor: para SMTP alcanza con `demo`.

Verificación: `https://red-cuidarte.vercel.app/health` → `{"ok":true}`, y `/demo/users` lista los usuarios.

## Proyecto web

Se leen al compilar: siempre redeploy después de cambiarlas.

| #   | Hecho | Variable                 | Para qué                        | Valor                                                            |
| --- | ----- | ------------------------ | ------------------------------- | ---------------------------------------------------------------- |
| 18  | [ ]   | `VITE_API_URL`           | URL de la API                   | `/api` (por el rewrite; antes `https://red-cuidarte.vercel.app`) |
| 19  | [ ]   | `VITE_SUPABASE_URL`      | Login por mail                  | `https://iahuyqmgfegtmocrhmdr.supabase.co`                       |
| 20  | [ ]   | `VITE_SUPABASE_ANON_KEY` | Login por mail (clave pública)  | Supabase › Project Settings › API Keys › `anon`                  |
| 21  | [x]   | `VITE_DEMO_MODE`         | Mostrar el selector de usuarios | `true` para la demo                                              |

Abrir la web siempre por `https://red-cuidarte-web.vercel.app`: es la única que acepta la API (variable 7).

## Supabase

| #   | Hecho | Paso                                                                  |
| --- | ----- | --------------------------------------------------------------------- |
| 22  | [x]   | Usuarios demo cargados (`supabase/seed/demo_users.sql` en SQL Editor) |
