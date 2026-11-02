# DNS y correo

Dominio `redasistir.online`, con el DNS administrado en DonWeb. Este documento describe qué registros crear y por qué; los valores exactos los indican Vercel y DonWeb al cargar el dominio. Cada registro debe verificarse con `dig` o `nslookup` una vez cargado (la propagación puede demorar).

## Vercel

Agregar los dominios en cada proyecto de Vercel (Settings › Domains) y cargar en DonWeb los valores que Vercel indique:

| Nombre                     | Tipo                                   | Valor                                                                  | Proyecto                   |
| -------------------------- | -------------------------------------- | ---------------------------------------------------------------------- | -------------------------- |
| `redasistir.online` (raíz) | A (o ALIAS/ANAME si DonWeb lo permite) | `76.76.21.21` (ver [IP de la raíz](#ip-de-la-raíz))                    | `web`                      |
| `www`                      | CNAME                                  | El que muestre Vercel                                                  | `web` (redirige a la raíz) |
| `api`                      | CNAME                                  | `cname.vercel-dns.com` o el específico del proyecto que muestre Vercel | `api`                      |

### Dominio principal

La raíz (`redasistir.online`) es el dominio principal del proyecto `web`; `www` redirige a la raíz con un 308. No debe configurarse al revés: las passkeys solo se aceptan desde `https://redasistir.online` (`WEBAUTHN_ORIGINS` y `ALLOWED_ORIGINS` en la API), por lo que con la aplicación servida desde `www` no se puede registrar ni verificar la passkey.

### IP de la raíz

El panel de Vercel sugiere actualmente `216.198.79.1`. En una prueba realizada el 2026-10-30 desde una red doméstica, ese rango (`216.198.79.x`) produjo timeouts en más de la mitad de las conexiones, mientras que `76.76.21.21` y `64.29.17.1` respondieron siempre. Con la raíz apuntando solo a `216.198.79.1`, la aplicación abría desde el caché pero todos los pedidos fallaban.

Recomendación: usar `76.76.21.21` (opcionalmente con un segundo registro A a `64.29.17.1`) y volver a comprobar contra el panel de Vercel antes del lanzamiento.

### Certificados y archivos de verificación

Vercel emite los certificados HTTPS únicamente cuando el DNS resuelve correctamente. Los archivos `/.well-known/assetlinks.json` (Android) y `apple-app-site-association` (iOS) se sirven desde el proyecto `web` (ver [`android.md`](android.md)).

## Diagnóstico de conectividad

Síntoma: la aplicación muestra «No pudimos conectarnos».

Antes de sospechar de la base de datos, comprobar si el problema es de red o de DNS. Si `www` o `red-cuidarte.vercel.app` responden y la raíz no, la causa es DNS o red, no la API.

```bash
# Raíz: repetir varias veces
curl -sS -o /dev/null -w "%{http_code} %{time_total}s\n" -m 8 https://redasistir.online/api/health
# API directa
curl -sS -o /dev/null -w "%{http_code}\n" -m 8 https://red-cuidarte.vercel.app/health
# Cada IP de Vercel por separado
curl -sS -o /dev/null -w "%{http_code} %{time_total}s\n" -m 8 --resolve redasistir.online:443:76.76.21.21 https://redasistir.online/api/health
```

Repetir la prueba desde datos móviles para descartar un problema del proveedor de internet.

## Correo `info@redasistir.online`

1. Crear la casilla en el panel de DonWeb y registrar servidor SMTP, puerto (465 TLS o 587 STARTTLS), usuario y contraseña en las variables `SMTP_*` (ver [`ops.md`](ops.md#variables-de-entorno)).
2. **SPF:** un único registro TXT en la raíz, por ejemplo `v=spf1 include:<dominio SPF de DonWeb> ~all` (usar el valor que indique DonWeb). Si ya existe un SPF, deben combinarse en uno solo: dos registros SPF invalidan ambos.
3. **DKIM:** DonWeb entrega un selector y una clave pública, que se cargan como registro TXT en `<selector>._domainkey`.
4. **DMARC:** registro TXT en `_dmarc` con `v=DMARC1; p=none; rua=mailto:info@redasistir.online`. Pasar a `p=quarantine` cuando los informes salgan limpios.
5. Si Supabase Auth envía los códigos de ingreso por este mismo SMTP (ver [`ops.md`](ops.md#supabase)), el volumen de correo aumenta: revisar el límite de envíos por hora de la casilla en DonWeb.

## Verificación del correo

Con la API desplegada y las variables cargadas, iniciar sesión como administrador y usar Admin › Correos › «Enviar mail de prueba» (`POST /admin/mail/test`) hacia una casilla de Gmail y una de Outlook.

Criterio de aceptación: el mensaje llega a la bandeja de entrada (no a spam) y, en el original del mensaje, SPF, DKIM y DMARC figuran como `pass`.
