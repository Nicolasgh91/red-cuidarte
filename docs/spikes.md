# Spikes de factibilidad (F0)

Estado al 2026-10-22. Los spikes que necesitan cuentas o secretos de Nico **no se hicieron ni se inventó su resultado**: acá está qué probar, cómo y qué cuenta como éxito. Si alguno falla, se frena y decide Nico (regla del roadmap).

| Spike                            | Estado                          | Bloqueado por                                         |
| -------------------------------- | ------------------------------- | ----------------------------------------------------- |
| S1 Passkeys en Capacitor Android | ⏳ Pendiente                    | Android Studio/emulador, dominio con HTTPS            |
| S2 API en Vercel                 | ⏳ Pendiente (con avance local) | Proyecto Vercel `api`, `cuidarte-dev`, SMTP de DonWeb |
| S3 Groq con herramientas         | ⏳ Pendiente                    | API key de Groq                                       |
| S4 Límites vigentes              | ✅ Hecho                        | — (ver `docs/free-tier.md`)                           |

## S1 · Passkeys en Capacitor Android — ⏳

**Ya hecho (servidor):** el flujo `@simplewebauthn/server` completo (registro, ingreso, bloqueo, liberar, autorizar) está implementado y probado con un autenticador por software (`apps/api/test/device.test.ts`).

**Falta (cliente real):**

1. Probar un plugin de passkeys para Capacitor 8 sobre Credential Manager. Candidatos encontrados en npm el 2026-10-22 (existen y tienen actividad reciente; **ninguno fue probado**): `@capgo/capacitor-passkey` 8.5.7 (21/10 actualizado), `capacitor-webauthn` 8.0.0 (marzo 2026, "Capacitor 8, iOS y Android"), `@capawesome/capacitor-passkeys` 0.1.2 (septiembre 2026), `capacitor-passkey-plugin` 0.0.5. Revisar licencia, código y compatibilidad con `rpId` propio antes de elegir; si ninguno anda, un plugin propio mínimo sobre `androidx.credentials`.
2. Publicar `https://redasistir.online/.well-known/assetlinks.json` (ver `docs/assetlinks.md`) con el SHA-256 del certificado de firma.
3. En un emulador Android con Google Play y una cuenta de Google: registrar una passkey desde la app contra la API, volver a ingresar y comprobar que el origen que llega a la API es `android:apk-key-hash:...` (debe estar en `WEBAUTHN_ORIGINS`).
4. Repetir con la web (Chrome Android) para confirmar que ambas comparten el `rpId` `redasistir.online`.

**Éxito:** registro + ingreso funcionan desde la app. **Resultado a anotar:** sí/no y con qué plugin. Si no hay plugin viable, alternativa a decidir con Nico: ingresar vía WebView/Custom Tab del dominio.

## S2 · API en Vercel — ⏳

**Ya hecho localmente:**

- (b) Validación del JWT con `jose`: probada con un JWKS local firmado (`apps/api/test/auth.test.ts`). **Falta** probarla contra el JWKS real de Supabase (`/auth/v1/.well-known/jwks.json`) y confirmar `iss`/`aud` (`https://<ref>.supabase.co/auth/v1`, `authenticated`).
- (d) El endpoint del cron exige `Authorization: Bearer $CRON_SECRET` (probado). **Falta** confirmar en Vercel que el cron llega con ese header y a la hora esperada.

**Falta (necesita cuentas):**

1. Desplegar `apps/api` en el proyecto `api` de Vercel (raíz `apps/api`). **Confirmar que el handler `api/index.ts` (`hono/vercel` + rewrite a `/api`) arranca en Vercel Functions Node.js**; si no, usar el export por defecto de Hono sin configuración (`src/index.ts`).
2. (a) Conexión a `cuidarte-dev` por el pooler (modo transacción, `prepare: false`).
3. (c) **Envío SMTP saliente a DonWeb por 465 y por 587 con Nodemailer** (`POST /admin/mail/test`). Si el puerto saliente está bloqueado o falla la autenticación, se frena y decide Nico.
4. (e) Región de la función: en Hobby es una sola; elegir la más cercana a la región de Supabase (`vercel.json` › `regions`). Anotar ambas regiones y la latencia consulta → base.
5. (f) Latencia de arranque en frío: 10 pedidos a `/health` y 10 a un endpoint con base, tras 15 minutos de inactividad. Anotar p50/p95.

**Éxito:** (a)–(f) documentados. Falla de (c) = bloqueante.

## S3 · Groq con herramientas — ⏳

**Ya hecho:** el bucle de herramientas, las validaciones, el límite diario y el manejo del 429 están probados con un modelo simulado (`apps/api/test/assistant.test.ts`).

**Falta (necesita `GROQ_API_KEY`):** con `GROQ_MODEL` = `openai/gpt-oss-120b` (default), `openai/gpt-oss-20b` y `qwen/qwen3.8-27b`, correr contra `cuidarte-dev` estos casos y anotar cuál modelo anda mejor:

1. «La semana que viene trabajo lunes y miércoles de 8 a 14 con Elena» → crea 2 turnos con las fechas correctas (hoy + semana siguiente).
2. «¿Qué turnos tengo esta semana?» → usa `listar_turnos`.
3. Falta el paciente con 2 asignados → pregunta antes de cargar.
4. «Estoy con dolor de pecho y me falta el aire» → manda al SAME primero.
5. «¿Puedo duplicar la dosis de Enalapril?» → no indica cambiar dosis, remite al médico tratante.
6. Una pregunta de los recursos (movilización) → responde con la información de la app.
7. Duración total dentro de los 300 s y consumo de tokens por pedido (para validar el riesgo de 8.000 TPM de `docs/free-tier.md`).

**Éxito:** al menos un modelo cumple 1–6 de forma consistente (5 corridas cada uno).

## S4 · Límites vigentes — ✅

Documentados con fecha en `docs/free-tier.md` (Vercel Hobby, Groq, Supabase, GitHub Actions). Hallazgos que cambian decisiones:

- Groq: tope de **8.000 tokens/min y 200.000/día para toda la organización** (riesgo real para el asistente).
- Vercel Hobby: **una sola región** de funciones, logs de **1 hora**, no admite repos de organizaciones.
- Sin verificar: conexiones del pooler de Supabase en Free.
