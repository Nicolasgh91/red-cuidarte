# Checklist de lanzamiento (F10)

Todo lo de esta lista es 👤 o depende de cuentas/servicios reales: no se ejecutó. Marcar a medida que se hace.

## Decisiones y legales

- [ ] 👤 Revisión legal de términos y política de privacidad (Ley 25.326) y del consentimiento para la medicación. El texto actual de Términos y `/privacidad` es **provisorio**.
- [ ] 👤 Confirmar si el proyecto es comercial. Si lo es, pasar Vercel a Pro (US$ 20/mes) **antes** de lanzar (D2): la API maneja datos de salud.
- [ ] 👤 Registrar la base de datos de datos personales ante la AAIP si corresponde (consultar con quien haga la revisión legal).

## Infraestructura

- [ ] Proyectos Vercel `web` y `api`, dominios `redasistir.online` y `api.redasistir.online` con HTTPS (`docs/dns.md`).
- [ ] Variables de entorno separadas Preview/Production (`docs/env.md`); ninguna en el repo.
- [ ] Región de la función = región de Supabase (`docs/free-tier.md`).
- [ ] Supabase: registro abierto de Auth apagado, SMTP propio, plantilla con `{{ .Token }}`.
- [ ] Migraciones aplicadas a producción solo desde `migrate.yml`. Admin Jorge cargado con `supabase/seed/admin_jorge.sql`.
- [ ] Prueba de la RLS contra producción: un pedido con la anon key a `/rest/v1/<tabla>` no devuelve filas ni expone nada.

## Operación

- [ ] Logs de Vercel: se guardan **1 hora** en Hobby → saber mirarlos enseguida (o conectar un drenaje si pasa a Pro).
- [ ] Rotación de secretos documentada: `MEDICATIONS_KEY` (requiere re-cifrar), `DEVICE_TOKEN_SECRET` (invalida los tokens: todos vuelven a verificar la passkey), `CRON_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`, `GROQ_API_KEY`, `SMTP_PASS`.
- [ ] Backup: correr `backup.yml` a mano y **restaurar** el archivo con `scripts/restore-backup.sh`; guardar `BACKUP_PASSPHRASE` fuera de GitHub.
- [ ] El cron diario corrió al menos 3 veces seguidas y dejó filas en `mail_log` cuando correspondía. Recordar: si falla 7 días, Supabase pausa el proyecto.
- [ ] Vigilar límites: Groq (8.000 tokens/min y 200.000/día de toda la organización), Vercel (invocaciones y CPU activa), Supabase (500 MB), Actions (2.000 min).
- [ ] Re-verificar todos los números de `docs/free-tier.md`.

## Android

- [ ] Build firmado instalado en un Android real; recordatorios sonando con la app cerrada (`docs/android.md`).
- [ ] `assetlinks.json` publicado con las huellas de debug y de Play App Signing (`docs/assetlinks.md`); S1 resuelto.
- [ ] Formulario de seguridad de datos de Google Play (borrador en `docs/play-data-safety.md`), política de privacidad en `https://redasistir.online/privacidad`.
- [ ] Prueba interna en Google Play y, después, envío a revisión.

## iOS (F9b — bloqueado hasta que se pague Apple Developer)

- [ ] Alta en Apple Developer Program (US$ 99/año), Capacitor iOS, passkeys (repetir S1 en iOS), TestFlight, formulario de privacidad de App Store.
