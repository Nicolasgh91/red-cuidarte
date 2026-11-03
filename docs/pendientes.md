# Pendientes

Único lugar donde se anota lo que falta. Si algo se resuelve, se tacha o se borra de acá; si aparece algo nuevo, se agrega acá y no en otro documento. Estado al 2026-11-03.

Prioridad: **Bloqueante** (no se puede publicar sin esto) · **Antes de lanzar** · **Mejora** (puede esperar al después del lanzamiento) · **A decidir** (falta una decisión de producto).

Contexto: [`spec.md`](spec.md) (qué hace la app), [`architecture.md`](architecture.md) (cómo está hecha), [`ops.md`](ops.md) (cómo se opera), [`vistas-por-rol.md`](vistas-por-rol.md) (pantallas y roles).

## 1. Producto y funcionalidad

- **A decidir** — **Recordatorios de medicación.** Los «Recordatorios» son de agua, estiramientos y relajación (`reminders/scheduler.ts`). La toma de un medicamento es solo una casilla «Dar X» en Tareas: no avisa a la hora ni marca atraso.
- **A decidir** — **Permisos entre cuidadores del mismo paciente.** Todos pueden todo: cualquiera quita las tareas diarias y la medicación de todos. Las tildas son compartidas y no muestran quién las puso. No hay familiar y profesional, ni principal y secundario.
- **Antes de lanzar** — **Consentimiento para la medicación.** No queda registro de que la persona o su representante lo dio; hoy solo figura en los Términos.
- **Antes de lanzar** — **El paciente no ve a quién está vinculado.** `GET /patient/today` expone cuidadores solo a través de turnos; sin turnos dice que no hay nadie. Falta listar los cuidadores asignados y avisar cuando se canjea su código.
- **Antes de lanzar** — **Derechos de datos de pacientes y administradores.** Se ejercen escribiendo por Contacto y se resuelven a mano en la base. No hay pantalla para que el admin edite o borre cuidadores y pacientes, ni para distinguir las cuentas autorregistradas de las que dio de alta.
- **Mejora** — **Turnos:** editar un turno (hoy se borra y se vuelve a cargar) y borrar una serie semanal de una vez. El «Deshacer» de un borrado recrea el turno con otro id y origen manual.
- **Mejora** — **Superposición de turnos:** se valida por cuidador, no por paciente; dos cuidadores pueden cubrir al mismo paciente a la misma hora.
- **Mejora** — **Pacientes:** desvincularse, editar o borrar un paciente y editar la medicación (hoy solo se quita y se vuelve a cargar).
- **Mejora** — **Bienestar:** editar o borrar un registro (hoy solo se borran con la cuenta). Dos registros del mismo día se ven iguales en la lista diaria: falta la hora.
- **Mejora** — **Tareas:** tarea de una sola vez; toda tarea diaria es recurrente.
- **A decidir** — **Avisos entre personas.** Nadie recibe una notificación por lo que hace otro (turnos cargados, tomas tildadas). Los únicos mails son cumpleaños, prueba y contacto.
- **A decidir** — **Respiro y relevo.** La app no permite pedir un reemplazo ni avisar que se necesita ayuda; «Pausa» son micro-descansos de 2 a 5 minutos.
- **Mejora** — **Sin conexión.** No hay caché ni cola: sin red, todo falla con el mensaje de conexión.

## 2. Seguridad y emergencias

- **Antes de lanzar** — **Aviso de urgencia del asistente.** Validarlo con un profesional de Red Cuidar (`EMERGENCY_REPLY` en `apps/api/src/services/emergency.ts`) y revisar el clasificador: cubre síntomas físicos del paciente, no atragantamiento, sobredosis o error de medicación («le di doble dosis»), fiebre alta ni crisis emocional del cuidador.
- **A decidir** — **Bienestar muy bajo.** Ante ánimo «Muy bajo» o estrés «Muy alto» no hay derivación ni línea de ayuda; el número lo debe validar un profesional.
- **Mejora** — **Número de urgencia.** El 107 está fijo en la UI (`labels.ts`); la FAQ dice «107 o el número de tu ciudad».
- **Antes de lanzar** — **Restablecer passkey.** Sin auditoría (`device_events` se quitó), sin aviso a la persona y sin revocar la sesión de Supabase ni cambiar la contraseña: quien tenga la contraseña puede registrar una passkey nueva (es el diseño documentado). El administrador puede restablecer incluso su propia cuenta.
- **Antes de lanzar** — **Alta sin verificar el mail.** `POST /signup` crea la cuenta con `email_confirm: true`: no se comprueba que el mail sea de quien se registra, y el 409 `email_taken` permite saber si un mail ya tiene cuenta (límite de 5 por hora por IP).
- **Antes de lanzar** — **Cambio de mail en Perfil.** Actualiza `caregivers.email` y `users.email`, pero `AuthAdmin` solo tiene `createUser` y `deleteUser`: el mail de ingreso de Supabase Auth podría no cambiar. Verificar de punta a punta.
- **Mejora** — **Límites que faltan:** `POST /admin/mail/test` (destino libre), `POST /patient/link-code` y `/device/*` (hoy solo el desafío de 5 minutos).
- **Mejora** — **Borrar la cuenta de un cuidador:** borra en cascada sus tildas (`task_completions.caregiver_id`), que desaparecen de los checklists de los pacientes; los pacientes que creó quedan con su ficha y su medicación, y el texto de Perfil no lo dice. Tampoco pide volver a autenticarse.

## 3. Legal y privacidad

- **Bloqueante** — **Revisión legal** de Términos y Privacidad (Ley 25.326) y del consentimiento para la medicación. Los textos son provisorios y la nota «Texto provisorio…» se muestra a los usuarios hasta entonces.
- **Antes de lanzar** — **WhatsApp.** El botón abre un chat externo con un número fijo (`WhatsAppButton.tsx`); no advierte «No incluyas datos de salud» como sí hace Contacto y no figura en la política de privacidad ni en [`play-data-safety.md`](play-data-safety.md).
- **Antes de lanzar** — **Google Calendar.** El título del evento lleva el nombre del paciente y la UI no avisa que ese dato va a Google.
- **Antes de lanzar** — **Asistente.** La pantalla no dice que los mensajes y los datos de pacientes y medicación se envían a Groq; solo lo dice la política.
- **Mejora** — **Términos según el rol.** Los Términos describen funciones del cuidador (bienestar, asistente) también a quien entra como paciente.

## 4. Contenido (panel del administrador)

- **Mejora** — Sin borrador, vista previa ni historial: guardar publica al instante y «Volver al texto original» no se deshace.
- **Mejora** — Cambiar de pestaña o de página descarta en silencio lo que no se guardó.
- **Mejora** — Los errores de validación no dicen qué campo falla («Hay un texto vacío.») y no hay contadores de caracteres.
- **Mejora** — «Nuevo recurso» arma el id desde un texto fijo (`recurso-nuevo`, `recurso-nuevo-2`…) en vez del título, así que los enlaces `/recursos/:id` no reflejan el título.
- **Mejora** — La lista de preguntas frecuentes puede quedar vacía (el esquema no exige mínimo); el asistente la recibiría vacía.
- **Mejora** — El selector de íconos lista identificadores técnicos en inglés (`sprout`, `coffee`) sin vista previa. La pestaña se llama «Landing».
- **Mejora** — Los mensajes de error de correo que ve el admin nombran variables de entorno (`SMTP_HOST`…): son útiles para quien opera, pero son jerga en una pantalla de coordinación.

## 5. Correos y cron

- **Mejora** — El historial de envíos se corta en 100 filas, sin paginar y sin el año en la fecha.
- **Mejora** — Un envío `pending` que se corta queda «En curso» para siempre: solo se reintentan los `failed`.
- **Mejora** — No hay botón para reintentar un cumpleaños fallido; el job solo mira a quienes cumplen hoy, así que el reintento exige llamar al endpoint con el secreto el mismo día.
- **Mejora** — Cumpleaños del 29/2 en años no bisiestos: el mail sale el 28/2 y la tabla «Próximos cumpleaños» muestra el 1/3.
- **Mejora** — La pantalla Correos dice que el servidor revisa «a las 09:00»; en Hobby dispara entre las 09:00 y las 09:59 ([`spec.md`](spec.md#requerimientos)).

## 6. Técnico e infraestructura

- **Mejora** — **Idempotencia del asistente.** Si la respuesta se pierde después de cargar turnos (se corta la red o se cierra la app) y la persona lo pide de nuevo con otras palabras, el modelo puede resolver fechas distintas que no se pisan y cargarlas. Se ven en Turnos y se pueden borrar. Una garantía estricta necesita una clave por mensaje guardada en la base (columna `shifts.request_id` con índice único y un `request_id` del cliente): es una migración, para cuando aparezcan casos reales.
- **Antes de lanzar** — **Dominios.** La configuración prevista está en [`dns.md`](dns.md), pero aún no se aplicó: hoy la web reescribe a `red-cuidarte.vercel.app` y `api.redasistir.online` no está configurado.
- **Mejora** — **Caché de `/content`.** La ruta responde `Cache-Control: public, max-age=30` (`routes/content.ts`), pero el middleware global lo pisa con `private, no-store` (`app.ts`): el contenido público se consulta a la base en cada visita. Sin test que lo cubra.
- **Mejora** — **Versiones de Postgres.** Docker local y CI usan 16; Supabase y el backup, 17.
- **Mejora** — **Build de Vercel sin `strict`.** El build de la API no lee el `tsconfig` base, por eso `pnpm typecheck` compila también con `--strict false` y los tipos de entrada salen de los esquemas de zod.
- **Antes de lanzar** — **Rotación de `MEDICATIONS_KEY`.** No hay procedimiento (requiere re-cifrar toda la medicación).

## 7. Accesibilidad

- **Mejora** — Los diálogos de pausa y de urgencia declaran `aria-modal` pero no atrapan el foco (solo Esc y foco inicial).
- **Mejora** — Los puntos del historial semanal de bienestar solo se distinguen por color y `title`.
- **Mejora** — El toast con «Deshacer» dura 6 segundos: corto para quien usa teclado o lector de pantalla.
- **A decidir** — Tamaños de texto (cuerpo de 15 px, pistas de 0,86 rem) para un público mayor: validar con usuarios antes de cambiar.

## 8. Pruebas con servicios reales

- **Bloqueante** — **Passkeys en Android:** ver [`android.md`](android.md#passkeys-y-assetlinksjson). Hasta resolverlo, la app Android no se puede usar en producción.
- **Antes de lanzar** — **Revisión visual en celular:** la barra inferior del cuidador pasó a 6 ítems (hay una regla preventiva para ≤360 px) y el botón «Mi cuenta» pierde el texto bajo 620 px; ninguna de las dos cosas se vio en una pantalla real.
- **Antes de lanzar** — **API en Vercel:** validar el JWT contra el JWKS real de Supabase (`iss`/`aud`), SMTP saliente a DonWeb por 465 y 587 (si falla, es bloqueante), que el cron llegue con el header, y la latencia de arranque en frío (10 pedidos tras 15 min de inactividad).
- **Antes de lanzar** — **Groq con herramientas:** `GROQ_API_KEY=… pnpm --filter api eval:assistant 5` corre cada caso 5 veces contra la base de pruebas local (la recrea; nunca toca datos reales): cargar turnos con las fechas correctas, listar, preguntar si falta el paciente, urgencia activa e hipotética, no cambiar dosis, responder con los recursos e historial largo. Muestra por caso aciertos, tokens efectivos (primera corrida y resto, para ver el caché), llamadas, latencia, 429 y motivo de fin. Correrlo con `openai/gpt-oss-120b`, `openai/gpt-oss-20b` y `qwen/qwen3.8-27b` (`GROQ_MODEL=…`) y anotar acá los números. Gasta cupo de la cuenta.

## 9. Checklist de lanzamiento

**Decisiones y legales**

- [ ] Revisión legal de términos, privacidad (Ley 25.326) y consentimiento para la medicación. Los textos actuales son **provisorios**.
- [ ] Confirmar si el proyecto es comercial (si lo es, Vercel Pro antes de lanzar).
- [ ] Registrar la base de datos personales ante la AAIP si corresponde.
- [ ] Validar con un profesional de Red Cuidar el aviso de urgencia del asistente (`EMERGENCY_REPLY` en `apps/api/src/services/emergency.ts`).

**Infraestructura**

- [ ] Dominios `redasistir.online` y `api.redasistir.online` con HTTPS ([`dns.md`](dns.md)).
- [ ] Variables separadas Preview/Production; ninguna en el repo.
- [ ] Supabase Auth configurado ([`ops.md`](ops.md#supabase)). Migraciones aplicadas en orden. Admin cargado.
- [ ] RLS contra producción: un pedido con la anon key a `/rest/v1/<tabla>` no devuelve nada.

**Operación**

- [ ] Rotación de secretos documentada: `MEDICATIONS_KEY` (requiere re-cifrar), `DEVICE_TOKEN_SECRET` (todos vuelven a verificar la passkey), `CRON_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`, `GROQ_API_KEY`, `SMTP_PASS`.
- [ ] Correr `backup.yml` a mano y **restaurar** con `scripts/restore-backup.sh`.
- [ ] Correo configurado ([`ops.md`](ops.md#correo-donweb)); un mensaje de Contacto llega con `Reply-To` = mail de quien escribe.
- [ ] El cron corrió 3 días seguidos y dejó filas en `mail_log` cuando correspondía.
- [ ] Vigilar los límites de la tabla de [`ops.md`](ops.md#límites-de-los-planes-gratuitos).

**Android** ([`android.md`](android.md))

- [ ] Build firmado en un Android real; recordatorios sonando con la app cerrada.
- [ ] `assetlinks.json` publicado con las huellas de debug y de Play App Signing; passkeys en Android resueltas.
- [ ] Formulario de seguridad de datos ([`play-data-safety.md`](play-data-safety.md)) y política en `https://redasistir.online/privacidad`.
- [ ] Prueba interna en Google Play y envío a revisión.

**iOS** (en espera del pago de Apple Developer): Capacitor iOS, passkeys (repetir la validación hecha en Android), TestFlight y formulario de privacidad de App Store.

## 10. Copy y textos

- **Mejora** — Terminología que quedó sin unificar: «mail», «correo» y «Correo electrónico» conviven; «Micro-descanso» y «Micro-momentos» con guion.
- **Mejora** — «hace 2 d» en la columna «Último uso» de Passkeys (`ago()` en `lib/dates.ts`); el resto de la app ya escribe «días».
- **Mejora** — Mensajes de la API que siguen diciendo «persona» en genérico: «Esa persona no está asignada a tu cuenta.» y «No encontramos a esa persona.» (`services/access.ts`), «Pedile a la persona uno nuevo.» (`services/linkCode.ts`) y el _prompt_ del asistente. Decidir si pasan a «paciente».
- **Mejora** — El foco inicial del diálogo de urgencia cae en «Llamar al 107»; si se prefiere un foco neutro, mover al botón Cerrar o al título.
- **Mejora** — El mensaje de `auth/services.ts` que cita «¿Primera vez u olvidaste tu contraseña?» no tiene test (hay que simular Supabase).
- **Mejora** — La landing y el lead de ingreso siguen hablándole a quien cuida («Vos sostenés a otros»); un paciente que se registra lo ve igual.
