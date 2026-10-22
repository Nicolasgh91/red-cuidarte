# Cuidarte+ — avance del roadmap

Actualizado el 2026-10-22. Nada está commiteado: los cambios están en el árbol de trabajo para que Nico los revise y commitee (regla del roadmap). Ningún servicio externo se tocó: no hay deploys, ni cuentas, ni escrituras a `cuidarte-prod`.

## Estado por fase

| Fase | Estado | Qué se verificó (en esta máquina) | Qué falta |
|---|---|---|---|
| F0 | ⏳ Parcial | S4 hecho (`docs/free-tier.md`); S1–S3 documentados con procedimiento en `docs/spikes.md` | 👤 todas las cuentas, MCP, claves; correr S1–S3 |
| F1 | ✅ Local | `pnpm format:check && lint && typecheck && test` y `build` en verde; `ci.yml` escrito | Ver que corra en GitHub y el preview de Vercel (👤) |
| F2 | ✅ Local | Migración limpia en Postgres 16 local; RLS en las 16 tablas, sin políticas, `anon`/`authenticated` sin acceso; escalas 0–4; sin superposición de turnos | Aplicar en `cuidarte-dev` (MCP) y prod (`migrate.yml`); cargar el admin Jorge (👤) |
| F3 | ✅ Local | 92 tests de integración de la API; aislamiento entre cuidadores, roles, CORS | Deploy en `api.redasistir.online` (👤) |
| F4 | ✅ Servidor | Passkeys probadas con un autenticador por software: bloqueo del 2.º dispositivo, liberar, autorizar | S1: passkeys reales en Android (plugin) |
| F5 | ✅ Local | 107 tests del front; build; navegador headless a 360 px sin scroll horizontal en las 22 rutas, con API y Supabase simulados | Probar contra Supabase/API reales; iPhone real; dominio |
| F6 | ✅ Código | Mail de prueba y registro en `mail_log` con SMTP simulado | 👤 casilla, SPF/DKIM/DMARC (`docs/dns.md`); S2c |
| F7 | ✅ Local | Cumpleaños idempotentes, reintento, zona horaria AR, 29/2; backup cifrado y **restauración** probada en Postgres local | 👤 secretos de `backup.yml`; ver el cron real de Vercel |
| F8 | ✅ Con modelo simulado | Bucle de herramientas, validaciones iguales a las del alta manual, límite 20/día en la base, 429 de Groq, Deshacer | S3: calidad real del modelo (👤 API key) |
| F9a | ⚠️ Parcial | Proyecto Android generado, notificaciones locales (tests con plugin simulado), `/privacidad`, borrador de Play | **Nunca se compiló el APK** (no hay Android SDK aquí); passkeys bloqueadas por S1; probar recordatorios en un teléfono real |
| F9b | ⛔ Bloqueada | — | 👤 pago de Apple |
| F10 | ⛔ No ejecutada | `docs/launch-checklist.md` | 👤 todo |

## Qué tenés que hacer vos (👤), en orden

1. Crear `cuidarte-dev` (Supabase), el MCP de Supabase solo a dev, cuenta y API key de Groq, los dos proyectos de Vercel (`web` raíz `apps/web`, `api` raíz `apps/api`), la casilla y el SMTP de DonWeb, Google Play Console.
2. Cargar variables en Vercel y secretos en GitHub (`docs/env.md`). Crear el Environment `production` en GitHub.
3. Configurar Supabase Auth: registro abierto apagado, SMTP propio, plantilla con `{{ .Token }}` (`docs/env.md`).
4. **Elegir la región de la función de Vercel** igual a la de `cuidarte-prod` (Hobby permite una sola; el default es Washington `iad1`). Poner `"regions"` en `apps/api/vercel.json`.
5. Correr las spikes S1–S3 (`docs/spikes.md`) y anotar los resultados. Si S2c (SMTP) falla, frenar y decidir.
6. Cargar DNS (`docs/dns.md`) y el admin Jorge (`supabase/seed/admin_jorge.sql`).
7. Compilar y probar en Android (`docs/android.md`).
8. Revisión legal (Términos y `/privacidad`, ambos provisorios) y decidir si el proyecto es comercial (Vercel Pro).

## Decisiones que tomé y conviene que confirmes (`docs/decisions.md`)

- Cifrado de medicación en la aplicación (AES-256-GCM), no `pgcrypto`.
- Ingreso por **código de 6 dígitos por mail** (sin contraseñas), en vez de mail + contraseña o enlace mágico.
- Modelo de `mail_log` con índice único parcial solo para cumpleaños, y `year`/`status`.
- Restricción de exclusión (`btree_gist`) además de la validación de turnos.
- TypeScript 6.0 (no 7) por compatibilidad de `typescript-eslint`.
- Recordatorios de Android sin alarma exacta (para no depender del permiso restringido por Play).
- Modelo por defecto de Groq `openai/gpt-oss-120b` (a confirmar en S3).

## Riesgos y hallazgos

- **Groq:** el tope gratuito es de 8.000 tokens/min y 200.000/día para toda la organización; el asistente gasta ~2.200 tokens fijos por pedido. Puede quedarse corto con pocos usuarios activos. No resuelto: decisión de Nico (`docs/free-tier.md`).
- **Vercel Hobby:** una sola región, logs de 1 hora, no admite repos de organizaciones, uso no comercial (D2).
- **Supabase Free:** un cron que falle 7 días pausa producción.
- **App Android:** sin passkeys (S1) no se puede ingresar desde la app. No es lanzable hasta resolverlo.
- Si se borran los datos del navegador, el usuario pierde la credencial local y queda bloqueado hasta que el admin libere (costo inherente a no poder identificar el equipo).
- Lo verificado con simulaciones (Supabase, SMTP, Groq, WebAuthn real, plugin de notificaciones) puede comportarse distinto en los servicios reales.

## Temas vecinos anotados (sin arreglar, fuera de alcance)

- La spec/prototipo tenían campos de perfil que no están en el modelo de datos (género, nacionalidad, país, barrios, alertas, ubicación, número SAME propio): se omitieron del front. Si se quieren, hay que agregarlos a la spec y al modelo.
- El roadmap cita la spec en `claude/cuidarte-spec-v2.md`; el archivo real es `tasks/spec-v2.md`.
- Panel y Correos del admin muestran una tarjeta estática «Casilla de correo en DonWeb: Pendiente» y un estado fijo «Programado» para cumpleaños.
- El código de ingreso está fijo en 6 dígitos en el front; si Supabase se configura con otra longitud, hay que cambiarlo.
- Sin trampa de foco en los modales (el prototipo tampoco la tenía).
- Rotación de `MEDICATIONS_KEY` no implementada.

## Commits propuestos (atómicos, cada uno compila y pasa solo)

Orden sugerido; ejecutar `pnpm install` en cada paso no hace falta (el lockfile va en el primero que agrega dependencias).

1. `chore: scaffold pnpm monorepo with strict TypeScript, ESLint and Prettier` — raíz (`package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `.editorconfig`, `.gitignore`, `.prettier*`, `eslint.config.js`, `pnpm-lock.yaml`), `README.md`, `docker-compose.yml`.
2. `feat(db): add initial schema with RLS, overlap exclusion and local migration script` — `supabase/**`, `scripts/migrate-local.mjs`.
3. `feat(api): add Hono API with auth, roles, shifts, tasks, wellbeing, reminders, admin and patient routes` — `apps/api/**` (sin `routes/device.ts`, `routes/internal.ts`, `services/assistant.ts` si se quiere más fino) y `docs/env.md`.
4. `feat(api): add one-device-per-account passkey flow` — `routes/device.ts`, `auth/deviceToken.ts`, tests.
5. `feat(api): add daily cron job, mail test endpoint and weekly encrypted backup` — `routes/internal.ts`, `services/dailyJob.ts`, `services/mail*.ts`, `.github/workflows/backup.yml`, `scripts/restore-backup.sh`.
6. `feat(api): add Groq assistant with shift tools and daily limit` — `services/assistant.ts`, `routes/assistant.ts`, `services/llm.ts`, tests.
7. `feat(web): port prototype to React with typed API client, auth and PWA` — `apps/web/**` (sin `android/`, `capacitor.config.ts`, `native*`).
8. `feat(android): add Capacitor Android project with native reminders and privacy page` — `apps/web/android/**`, `capacitor.config.ts`, `src/reminders/native*`, `Privacidad`.
9. `ci: add CI and production migration workflows` — `.github/workflows/ci.yml`, `migrate.yml`.
10. `docs: add decisions, free-tier limits, spikes, DNS, Android and launch docs` — `docs/**`, `tasks/progress.md`.

Nota: el orden 3→4→6 compila porque `app.ts` importa todas las rutas; si querés commits más finos, agrupá 3–6 en uno solo.
