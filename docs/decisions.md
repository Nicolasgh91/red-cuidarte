# Decisiones de implementación

Complementan las decisiones cerradas D1–D6 del roadmap y la spec v2 (que no se reabren). Acá van las que el roadmap delegó a cada fase y las que surgieron al implementar. Si alguna no te cierra, cambiarla ahora sale barato.

## F2 · Cifrado de `medications`: en la aplicación, no con `pgcrypto`

AES-256-GCM en la API, con la clave en la variable de entorno `MEDICATIONS_KEY` (Vercel). Se cifran `name` y `dose` (`bytea`); `times` queda en claro porque hace falta para armar el checklist y ordenar tomas.

- **Por qué no `pgcrypto`:** la clave viajaría dentro de cada consulta SQL y quedaría en logs de Postgres, `pg_stat_statements` y en el historial del pooler. Con cifrado en la app, la base nunca ve la clave ni el texto.
- **Costo:** la base no puede buscar ni ordenar por nombre de medicamento (no se necesita). Perder la clave = perder la medicación; por eso `docs/env.md` pide guardarla en un gestor.
- **Rotación:** no implementada (fuera de alcance). Habría que re-cifrar todas las filas con una clave nueva.

## F5b · Ingreso con mail + contraseña y autorregistro de cuidadores (reemplaza a F5)

Se pidió una landing pública, ingreso con mail y contraseña y una página para que cada cuidador/a cree su propia cuenta (referencia visual: la pantalla de ingreso del prototipo con foto de atardecer).

- **Ingreso:** `signInWithPassword` de Supabase. Después sigue igual que antes: passkey del dispositivo (F4).
- **Registro:** `POST /signup` en la API, público. Crea el usuario de Auth **con contraseña y ya confirmado** (service role) y la ficha de cuidador/a, sin pacientes; el admin los asigna después. Usa el mismo servicio que el alta del admin (`services/caregivers.ts`). Luego la web inicia sesión sola.
- **Registro abierto de Supabase sigue apagado:** las altas pasan siempre por la API, que crea también la fila en `users`. Así no hay usuarios de Auth sin rol.
- **Límite:** 5 registros por IP por hora (tabla `signup_attempts`). No hay verificación del mail: cualquiera puede crear una cuenta de cuidador/a con un mail ajeno, pero no ve nada hasta que el admin le asigna pacientes. Si se abusa, el siguiente paso es confirmar el mail con un código antes de crear la ficha.
- **Primera vez y olvido de contraseña:** las cuentas que da de alta el admin (y las personas cuidadas con mail) se crean sin contraseña. Entran por «¿Primera vez u olvidaste tu contraseña?»: `resetPasswordForEmail` manda un código de 6 dígitos, `verifyOtp({ type: "recovery" })` abre la sesión y `updateUser` guarda la contraseña. Sigue dependiendo del SMTP de DonWeb, como F5.
- **Rutas sin sesión:** `/` (landing, también en la app Android; solo ofrece «Ingresar»), `/ingresar` (con el enlace a crear cuenta), `/registro`, `/recuperar`, `/terminos` y `/privacidad`. Cualquier otra ruta lleva a `/ingresar`.
- **Registro con rol:** en `/registro` se elige «cuidador/a» o «paciente» (`POST /signup` con `role`). El paciente pide nombre, apellido, mail y contraseña y queda sin cuidadores hasta que el admin lo asigne. No se puede registrar un admin: ese rol se da en la base de datos.
- **Medicación a cargo del cuidador:** el cuidador/a carga y quita la medicación de sus pacientes asignados; el admin conserva esa función.
- **Vincular con un código:** un paciente que se registra solo no tiene cuidador. Para vincularse comparte un código de un solo uso (48 h) y el cuidador lo canjea; no se puede asignar a alguien por su mail, porque daría acceso a su medicación sin su consentimiento.
- **Contenido editable:** el admin edita frases, recursos, preguntas frecuentes, textos de la landing y páginas legales (tabla `site_content`, ver `docs/architecture.md` 11.1). Los textos legales siguen siendo provisorios y deben revisarse con un profesional.
- **Modo demo eliminado:** se quitaron `DEMO_MODE`/`VITE_DEMO_MODE`, el selector de usuarios, `GET /demo/users`, el atajo `Bearer demo:<id>` y el mock de desarrollo (`dev:mock`).

## F5 · Ingreso: código de 6 dígitos por mail (Supabase Auth OTP), sin contraseñas — reemplazada por F5b

El roadmap dejaba "mail + contraseña o enlace mágico". Se elige **código por mail**:

- El prototipo da de alta cuidadores sin contraseña y avisa que les llega un mail para activar la cuenta: encaja con ingreso por mail.
- A diferencia del enlace mágico, el código funciona igual en la web, en la PWA de iPhone y en la app Capacitor, sin _deep links_.
- No hay que administrar contraseñas ni pantalla de cambio/recuperación.
- Los usuarios los crea la API (`SUPABASE_SERVICE_ROLE_KEY`) ya confirmados; el registro abierto queda apagado.
- **Dependencia:** Supabase tiene que mandar los mails por el SMTP de DonWeb (ver `docs/env.md`). Hasta que S2(c) confirme que el SMTP funciona, el ingreso real no se puede probar.
- Las personas cuidadas sin mail son solo una ficha (no ingresan); con mail pueden ingresar y ver "Hoy".

## F4 · Cómo se hace cumplir "un dispositivo por cuenta"

- Tras Supabase Auth, el cliente verifica la passkey y la API devuelve un **token de dispositivo** (HS256, 30 días) con el id de usuario y la credencial. La API lo exige en el header `X-Device-Token` en todas las rutas, salvo `/device/*` y `/internal/*`.
- Se compara contra la credencial **vigente** en `devices` en cada pedido: al "Liberar" o reemplazar el dispositivo, el token viejo deja de servir enseguida.
- **Primer ingreso:** `POST /device/register/*`. Si la cuenta ya tiene dispositivo y no hay un intento autorizado → 403 `device_blocked` y fila en `device_attempts` (`blocked`). Reintentos del mismo dispositivo en 10 min actualizan el mismo intento.
- **Liberar:** borra el dispositivo; el siguiente ingreso registra uno nuevo.
- **Autorizar el nuevo:** marca el último intento como `authorized` y descarta los demás bloqueos; el próximo registro reemplaza la credencial y consume la autorización (una sola vez).
- Cómo sabe el cliente si ya tiene credencial: guarda el id en `localStorage` al registrar. Si el usuario borra los datos del navegador, queda bloqueado hasta que el admin libere (es el costo de no poder identificar el equipo).
- IP (`x-forwarded-for`) y user agent se guardan solo como auditoría.

## F2/F3 · Detalles de modelo que la spec no fijaba

- `mail_log`: la spec pide `UNIQUE(to_email, kind, year)`. Como el mail de prueba (`kind = 'test'`) tiene que poder repetirse, la unicidad es un índice parcial `WHERE kind = 'birthday'`. Se agrega `year` (año del cumpleaños, hora de Argentina) y `status` ∈ {pending, sent, failed}; un envío fallido se reintenta en la siguiente corrida, uno enviado no.
- `shifts`: además de la validación en el servicio (mensajes claros), una **restricción de exclusión** (`btree_gist` en el esquema `extensions`) impide la superposición aun con pedidos simultáneos. Un turno cuya hora de fin es menor que la de inicio cruza la medianoche; inicio = fin se rechaza.
- Fechas: el servicio usa la fecha de Argentina (`America/Argentina/Buenos_Aires`) para "hoy", cumpleaños y semanas del bienestar (lunes a domingo).
- Personas cuidadas sin mail: se les genera un UUID propio (no hay usuario en Auth). La spec dice `users.email NULL`, lo que lo permite.
- El asistente recibe la conversación del cliente en cada pedido (la API no guarda conversaciones, como dice el prototipo: «La conversación no se guarda»).
- `Deshacer` del asistente borra solo turnos propios con `source = 'assistant'`.

## Contacto

- Una sola casilla, `info@redasistir.online`, para enviar (`SMTP_FROM`, `SMTP_USER`) y para recibir: el formulario manda a `SMTP_FROM`, sin variable aparte. Antes era `avisos@`.
- `mail_log` ya tenía el índice único parcial solo para cumpleaños; para contacto alcanza con sumar `'contact'` al enum.
- Límite de 3 mensajes por usuario cada 24 h móviles contado en `contact_messages`; un `pg_advisory_xact_lock` por usuario evita que pedidos simultáneos se lo salteen. Los mensajes `failed` también cuentan.
- El asunto que escribe la persona no se copia a `mail_log` (el admin lo ve en Correos y podría tener datos de salud): ahí queda «Mensaje de contacto».
- El asunto se limpia de saltos de línea y caracteres de control antes de guardarse y de armar el mail (evita inyectar cabeceras).

## Herramientas

- **TypeScript 6.0.x** (no 7): `typescript-eslint` todavía no soporta TS 7 (ver https://github.com/typescript-eslint/typescript-eslint/issues/10940). Revisar cuando lo soporte.
- Imports relativos con extensión `.js` (resuelven a los `.ts`): lo que pide ESM de Node en las Vercel Functions.
- `pnpm` 11 bloquea scripts de instalación: `pnpm-workspace.yaml` autoriza solo `esbuild`.
