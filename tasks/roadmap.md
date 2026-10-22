# Cuidarte+ — roadmap de implementación

Plan de ejecución para Claude Cowork. La fuente de verdad funcional es `claude/cuidarte-spec-v2.md`; la referencia visual y de comportamiento es el artifact "Cuidarte+" (prototipo v2). Este roadmap no reabre decisiones de la spec.

- Repo: https://github.com/Nicolasgh91/red-cuidarte (privado)
- Dominio: `redasistir.online` (DNS en DonWeb)

## Reglas de ejecución

- **Spec primero (SPDD)**: todo lo que se construye sale de la spec. Si algo no está en la spec, se frena y se pregunta; no se inventa.
- **Fases en orden**. Cada fase termina cuando cumple sus criterios de aceptación. No se pausa para validar con usuarios.
- **Decisiones cerradas en planificación**: nada de "puede ser X o Y" durante la implementación. Si aparece una decisión nueva, se frena y se le pregunta a Nico.
- **Commits**: atómicos y que compilen solos. Los commits los hace Nico; el agente deja los cambios listos y propone el mensaje.
- **Evidencia**: antes de afirmar algo sobre el código (archivo, símbolo, contrato), verificarlo con grep en la misma sesión.
- **Sin alcance extra**: no arreglar temas vecinos dentro de una tarea; anotarlos como pendiente.
- **Secretos**: nunca en el repo. Van en GitHub Secrets y en las variables de entorno de Vercel.
- **Base de producción**: el agente nunca escribe en `cuidarte-prod` por MCP. Los cambios de esquema llegan a producción solo por migraciones aplicadas desde CI.
- **👤 = tarea de Nico**: crear cuentas, pagar, aceptar términos, cargar tarjetas y secretos. El agente no lo hace.
- Idioma: código, identificadores, rutas y commits en inglés; documentación y textos de la app en español rioplatense.

## Decisiones cerradas en esta revisión

| ID | Decisión |
|---|---|
| D1 | **LLM gratuito: Groq (free tier).** Sin tarjeta, ~30 pedidos por minuto y ~1.000 por día, y no usa los datos para entrenar. Se descarta la capa gratis de Gemini porque sí entrena con los datos fuera de la UE, y el contexto incluye medicación. Límite propio en la app: 20 mensajes por usuario por día. |
| D2 | **Vercel Hobby para la web y para la API.** Riesgo aceptado: Hobby es solo para uso no comercial (definición de Vercel: cualquier despliegue usado para el beneficio económico de cualquiera que participe en su producción, incluido quien cobra por escribir el código). Si Cuidarte+ pasa a ser comercial, hay que migrar a Pro (US$ 20/mes). Ahora el riesgo alcanza también a la API, que maneja datos de salud. |
| D3 | **iOS queda en espera del pago anual de Apple (US$ 99).** Se publica primero Android y la web. Mientras tanto, en iPhone se usa la web instalada en la pantalla de inicio. |
| D4 | **Sin Java, sin VM, sin Oracle, Koyeb ni Google Cloud. Backend en TypeScript sobre Vercel Functions (Node.js)**, como segundo proyecto de Vercel (`apps/api`) en `api.redasistir.online`. Framework: Hono, un único handler para toda la API. Consultas con `postgres` (postgres.js) y SQL escrito a mano; validación con Zod. Tipos compartidos con el front por Hono RPC. Gestor de paquetes: pnpm (workspaces). |
| D5 | **Supabase con dos proyectos**: `cuidarte-prod` (ya creado) y `cuidarte-dev`. El MCP de Supabase se conecta solo a `cuidarte-dev`; producción no se conecta, porque tiene datos de salud. Migraciones con Supabase CLI (`supabase/migrations`). |
| D6 | **Tareas programadas con Vercel Cron** (reemplaza el cron de GitHub Actions). En Hobby corre una vez por día y con precisión por hora: programado a las 12:00 UTC, dispara entre las 09:00 y las 09:59 de Argentina. Alcanza para los cumpleaños. |

Límites verificados en las páginas de Vercel (septiembre–octubre de 2026): función de Hobby hasta 300 s de duración; 100 cron jobs por proyecto pero uno por día; guía de uso justo de Hobby con 1 millón de invocaciones y 4 horas de CPU activa por mes.

## Arquitectura

```
App Android (Capacitor) ───────┐
Web redasistir.online (Vercel) ─┼─HTTPS─► api.redasistir.online (Vercel Functions, Hono)
                                │                │
                                └─ Supabase Auth │──► Supabase Postgres, por el pooler (solo la API accede)
                                                 ├──► Groq API (asistente)
                                                 └──► SMTP avisos@redasistir.online (DonWeb)
Vercel Cron (1 vez por día) → GET /internal/jobs/daily (secreto)
GitHub Actions: CI, migraciones a producción, backup semanal
```

- El front se autentica con Supabase Auth y manda el JWT a la API. La API lo valida con la librería `jose` contra el JWKS de Supabase y toma el rol de la tabla `users`.
- No hay proceso persistente: nada de estado en memoria (límites, cachés). El límite del asistente y el control de cumpleaños viven en la base.
- La API usa siempre el pooler de Supabase, porque cada invocación puede abrir una conexión nueva.
- La clave de Groq y las credenciales SMTP viven solo en las variables de entorno de Vercel del proyecto `api`.
- CORS: la API acepta el origen de la web y los de la app Capacitor.

## Repositorio

```
red-cuidarte/
  apps/api/        Hono + TypeScript, Vercel Functions
  apps/web/        React + Vite + TS + Capacitor (android/; ios/ en F9b)
  supabase/        migrations/ (SQL), config.toml
  .github/workflows/  ci.yml, migrate.yml, backup.yml
  docs/            spec, decisiones, límites de capas gratuitas
```

## Fases

### F0 · Cuentas, MCP y pruebas de factibilidad

👤 Nico:
- [x] Repo `red-cuidarte` en GitHub.
- [x] Supabase `cuidarte-prod`.
- [ ] Supabase `cuidarte-dev` (segundo proyecto gratis).
- [ ] MCP de Supabase en Claude Desktop apuntando a `cuidarte-dev` (configuración abajo).
- [ ] Groq: cuenta y API key.
- [ ] Vercel: cuenta Hobby con dos proyectos conectados al repo: `web` (raíz `apps/web`) y `api` (raíz `apps/api`).
- [ ] DonWeb: casilla `avisos@redasistir.online` y datos SMTP del panel.
- [ ] Google Play Console (US$ 25).

Configuración del MCP (en el archivo de configuración de Claude Desktop; el token se crea en Supabase › Account › Access Tokens):

```json
{
  "mcpServers": {
    "supabase": {
      "command": "npx",
      "args": ["-y", "@supabase/mcp-server-supabase@latest", "--project-ref=<ref de cuidarte-dev>"],
      "env": { "SUPABASE_ACCESS_TOKEN": "<personal access token>" }
    }
  }
}
```

Agente (pruebas cortas, en ramas `spike/`):
- [ ] **S1 Passkeys en Capacitor Android**: registrar y usar una passkey desde la app en un emulador Android con un plugin de passkeys para Capacitor, contra `@simplewebauthn/server` corriendo en la API. Incluye el archivo `assetlinks.json` en `redasistir.online`. Resultado: funciona sí/no, con qué plugin.
- [ ] **S2 API en Vercel**: desplegar una API mínima con Hono en el proyecto `api` y probar: (a) conexión a `cuidarte-dev` por el pooler, (b) validación de un JWT de Supabase con `jose`, (c) **envío SMTP saliente a DonWeb por 465 y 587 con Nodemailer**, (d) que el cron de Vercel llegue con el secreto esperado, (e) región de la función cercana a la región de Supabase, (f) latencia de un arranque en frío. Si el SMTP falla, se frena y Nico decide.
- [ ] **S3 Groq con herramientas**: confirmar que el modelo elegido del free tier soporta tool calling y responde bien en español con `listar_turnos` y `agregar_turnos`, dentro de los 300 s de la función.
- [ ] **S4 Límites vigentes**: confirmar en las páginas oficiales los límites de Vercel Hobby (invocaciones, CPU activa, ancho de banda, regiones disponibles), Groq, Supabase y GitHub Actions (minutos por mes en repo privado). Dejar los números con fecha en `docs/free-tier.md`.

**Aceptación**: cuentas creadas, MCP respondiendo sobre `cuidarte-dev`, S1 a S4 documentados en `docs/spikes.md`. Si alguna falla, se frena y Nico decide.

### F1 · Repo, CI y ambientes
- [ ] Monorepo pnpm con workspaces, README, `.editorconfig`, TypeScript estricto.
- [ ] `ci.yml`: lint, typecheck y tests de `api` y `web` en cada PR.
- [ ] Variables de entorno documentadas en `docs/env.md` (sin valores).
- [ ] Ambientes: `dev` (Postgres local en Docker + `cuidarte-dev`) y `prod` (`cuidarte-prod`). Vercel: variables separadas para Preview y Production.

**Aceptación**: un PR vacío pasa CI en verde y Vercel genera un preview de `web` y de `api`.

### F2 · Base de datos
- [ ] `supabase/migrations/…_init.sql` con todo el modelo de la spec, claves foráneas, índices (turnos por cuidador y fecha) y `CHECK` de escalas 0–4.
- [ ] RLS activado en todas las tablas del esquema público, sin políticas, para que la Data API de Supabase no exponga nada.
- [ ] Cifrado de `medications` (decidir en esta fase entre `pgcrypto` y cifrado en la aplicación con la clave en Vercel; dejarlo en `docs/decisions.md`).
- [ ] Script SQL de carga del admin Jorge (los datos reales los completa Nico).
- [ ] `migrate.yml`: aplica migraciones a producción solo desde CI. Antes se prueban en `cuidarte-dev` vía MCP.

**Aceptación**: las migraciones corren limpias en local, dev y prod. Un pedido con la anon key a la Data API no devuelve filas.

### F3 · Backend base
- [ ] Seguridad: validación del JWT de Supabase, rol desde `users`, autorización por rol en cada endpoint, CORS.
- [ ] Endpoints (Hono; tipos compartidos con el front por Hono RPC):
  - Perfil del cuidador (GET/PUT), borrar cuenta.
  - Admin: cuidadores (alta, lista, asignaciones), pacientes (alta, lista), medicación (alta, baja).
  - Turnos: listar por rango, alta (con repetición semanal), baja. Validación de superposición, incluidos los turnos que cruzan medianoche.
  - Tareas: checklist del día por paciente (plantillas + tomas de medicación), tildar/destildar, alta y baja de plantillas.
  - Bienestar: alta y listado (solo el dueño), resumen semanal.
  - Recordatorios: GET/PUT de `reminder_settings`.
  - Persona cuidada: turnos y medicación del día.
- [ ] Tests de integración por endpoint con Vitest contra Postgres local en Docker.
- [ ] Deploy: automático por la integración Git de Vercel (producción desde `main`).

**Aceptación**: tests en verde; la API responde en `api.redasistir.online`; un cuidador no puede leer bienestar ni turnos de otro.

### F4 · Un dispositivo por cuenta
- [ ] Registro de passkey en el primer ingreso y verificación en cada ingreso, con `@simplewebauthn/server`. El desafío se guarda en la base (no hay memoria entre invocaciones).
- [ ] Ingreso desde otra credencial → `device_attempts` con estado `blocked` y respuesta 403 con mensaje claro.
- [ ] Admin: liberar dispositivo y autorizar el intento bloqueado.
- [ ] IP y user agent guardados solo como auditoría.

**Aceptación**: segundo dispositivo bloqueado; tras "Liberar", el siguiente ingreso registra el nuevo.

### F5 · Front web
- [ ] Portar el prototipo a React por pantallas, respetando tokens de diseño, textos y tema claro/oscuro/sistema.
- [ ] Cliente de API tipado con Hono RPC (`hc`), importando `AppType` de `apps/api`. Rutas protegidas por rol.
- [ ] Login con Supabase Auth (mail + contraseña o enlace mágico; decidir en esta fase y documentarlo).
- [ ] Manifiesto de PWA para que en iPhone se pueda instalar en la pantalla de inicio (D3).
- [ ] Deploy en Vercel con dominio `redasistir.online`.

**Aceptación**: los tres roles navegan todas sus pantallas contra la API real; ancho de celular sin scroll horizontal.

### F6 · Dominio y correo (DNS en DonWeb)
- [ ] Registros para el proyecto `web` de Vercel en `redasistir.online`.
- [ ] Registro para el proyecto `api` de Vercel en `api.redasistir.online` (Vercel emite el certificado).
- [ ] SPF, DKIM y DMARC para `avisos@redasistir.online`.
- [ ] Nodemailer con el SMTP de DonWeb; endpoint de admin para mail de prueba.

**Aceptación**: el mail de prueba llega a la bandeja de entrada de Gmail y Outlook (no a spam); los dos dominios responden con HTTPS.

### F7 · Tareas programadas y backups
- [ ] `GET /internal/jobs/daily` protegido con secreto: envía los mails de cumpleaños (idempotente por año vía `mail_log`) y hace una consulta mínima a la base para que Supabase no pause el proyecto por inactividad (7 días).
- [ ] `vercel.json` con el cron diario a las 12:00 UTC (D6).
- [ ] `backup.yml`: `pg_dump` semanal de producción, cifrado (contiene datos de salud), guardado como artifact de GitHub Actions.

**Aceptación**: el cron corre y queda en `mail_log`; un backup se restaura en local.

### F8 · Asistente IA (Groq)
- [ ] Endpoint `POST /assistant/chat` que arma el contexto de la spec (recursos, FAQ, pacientes, medicación, turnos) y llama a Groq con las herramientas `listar_turnos` y `agregar_turnos`.
- [ ] Las herramientas se ejecutan en la API con las mismas validaciones de F3. La respuesta incluye los turnos agregados para el botón Deshacer.
- [ ] Límite de 20 mensajes por usuario por día en `assistant_usage`. Si Groq devuelve límite alcanzado, mensaje claro en la app.
- [ ] Pantalla de chat del prototipo conectada al endpoint.

**Aceptación**: "trabajo lunes y miércoles de 8 a 14 con Elena" crea los turnos correctos; una pregunta médica no recibe diagnóstico.

### F9a · App Android
- [ ] Capacitor Android sobre `apps/web`, íconos y splash.
- [ ] Recordatorios con notificaciones locales, reprogramados al guardar la configuración.
- [ ] Plugin de passkeys de S1 integrado, con `assetlinks.json` publicado en `redasistir.online`.
- [ ] Botón de urgencia con `tel:`.
- [ ] Política de privacidad en `redasistir.online/privacidad` y formulario de seguridad de datos de Google Play (declarar datos de salud).
- [ ] Prueba interna en Google Play.

**Aceptación**: build instalado en un Android real, recordatorios sonando con la app cerrada.

### F9b · App iOS (bloqueada hasta que Nico pague Apple Developer)
- [ ] 👤 Alta en Apple Developer Program (US$ 99/año).
- [ ] Capacitor iOS, compilado en la Mac de Nico con Xcode.
- [ ] Passkeys en iOS (repetir S1 para iOS, con el archivo de asociación de Apple en el dominio).
- [ ] TestFlight y formulario de privacidad de App Store.

### F10 · Lanzamiento
- [ ] 👤 Revisión legal de términos y privacidad (Ley 25.326) y consentimiento para la medicación.
- [ ] 👤 Confirmar con Nico si el proyecto es comercial; si lo es, pasar Vercel a Pro antes de lanzar (D2).
- [ ] Checklist: logs de Vercel, rotación de secretos, backup probado, límites de Groq y de Vercel vigilados.
- [ ] Envío a revisión en Google Play (y App Store cuando F9b esté hecho).

**Aceptación**: app Android aprobada y web en producción.

## Orden y dependencias

F0 → F1 → F2 → F3 → F4 → F5 → F6 → F7 → F8 → F9a → F10. F6 puede arrancar en paralelo a F3, porque el DNS tarda en propagarse. F9b se activa cuando se pague Apple.