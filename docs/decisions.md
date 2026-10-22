# Decisiones de implementación

Complementan las decisiones cerradas D1–D6 del roadmap y la spec v2 (que no se reabren). Acá van las que el roadmap delegó a cada fase y las que surgieron al implementar. Si alguna no te cierra, cambiarla ahora sale barato.

## F2 · Cifrado de `medications`: en la aplicación, no con `pgcrypto`

AES-256-GCM en la API, con la clave en la variable de entorno `MEDICATIONS_KEY` (Vercel). Se cifran `name` y `dose` (`bytea`); `times` queda en claro porque hace falta para armar el checklist y ordenar tomas.

- **Por qué no `pgcrypto`:** la clave viajaría dentro de cada consulta SQL y quedaría en logs de Postgres, `pg_stat_statements` y en el historial del pooler. Con cifrado en la app, la base nunca ve la clave ni el texto.
- **Costo:** la base no puede buscar ni ordenar por nombre de medicamento (no se necesita). Perder la clave = perder la medicación; por eso `docs/env.md` pide guardarla en un gestor.
- **Rotación:** no implementada (fuera de alcance). Habría que re-cifrar todas las filas con una clave nueva.

## F5 · Ingreso: código de 6 dígitos por mail (Supabase Auth OTP), sin contraseñas

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

## Herramientas

- **TypeScript 6.0.x** (no 7): `typescript-eslint` todavía no soporta TS 7 (ver https://github.com/typescript-eslint/typescript-eslint/issues/10940). Revisar cuando lo soporte.
- Imports relativos con extensión `.js` (resuelven a los `.ts`): lo que pide ESM de Node en las Vercel Functions.
- `pnpm` 11 bloquea scripts de instalación: `pnpm-workspace.yaml` autoriza solo `esbuild`.
