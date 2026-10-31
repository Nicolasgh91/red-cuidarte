# DNS y correo en DonWeb (👤 Nico)

Dominio `redasistir.online`, DNS administrado en DonWeb. Los valores exactos los dan Vercel y DonWeb al cargar el dominio; acá está qué registros hay que crear y por qué. Verificar cada uno con `dig`/`nslookup` después de cargarlo (la propagación puede tardar).

## Vercel

Agregar los dominios en cada proyecto de Vercel (Settings › Domains) y cargar lo que Vercel indique:

| Nombre                     | Tipo                                   | Valor                                                                       | Proyecto                   |
| -------------------------- | -------------------------------------- | --------------------------------------------------------------------------- | -------------------------- |
| `redasistir.online` (raíz) | A (o ALIAS/ANAME si DonWeb lo permite) | `76.76.21.21` (ver abajo: no usar `216.198.79.1`)                           | `web`                      |
| `www`                      | CNAME                                  | el que muestre Vercel                                                       | `web` (redirige a la raíz) |
| `api`                      | CNAME                                  | el que muestre Vercel (`cname.vercel-dns.com` o el específico del proyecto) | `api`                      |

**Dominio principal: la raíz.** En Vercel (proyecto `web` › Settings › Domains), `redasistir.online` va como principal y `www` con redirección 308 hacia la raíz. No al revés: las passkeys solo se aceptan desde `https://redasistir.online` (`WEBAUTHN_ORIGINS` y `ALLOWED_ORIGINS` en la API), así que con la app en `www` no se puede registrar ni verificar el dispositivo.

**IP de la raíz.** Vercel ahora sugiere `216.198.79.1`, pero el 2026-10-30 esa IP (y en general `216.198.79.x`) colgaba más de la mitad de las conexiones desde la red de Nico, mientras `76.76.21.21` y `64.29.17.1` respondían siempre. Con la raíz apuntando solo a `216.198.79.1`, la app abría desde el caché del service worker pero todos los pedidos fallaban («No pudimos conectarnos»). Usar `76.76.21.21` (o sumar un segundo A con `64.29.17.1`).

Vercel emite los certificados HTTPS solo cuando el DNS resuelve bien. Los archivos `/.well-known/assetlinks.json` (Android) y `apple-app-site-association` (iOS, F9b) se sirven desde el proyecto `web` (ver `docs/assetlinks.md`).

### Si la app dice «No pudimos conectarnos»

Antes de sospechar de la base, ver si el problema es la red. Si `www` o `red-cuidarte.vercel.app` responden y la raíz no, es DNS o red, no la API:

```bash
curl -sS -o /dev/null -w "%{http_code} %{time_total}s\n" -m 8 https://redasistir.online/api/health   # repetir varias veces
curl -sS -o /dev/null -w "%{http_code}\n" -m 8 https://red-cuidarte.vercel.app/health                 # API directa
# Probar cada IP de Vercel por separado:
curl -sS -o /dev/null -w "%{http_code} %{time_total}s\n" -m 8 --resolve redasistir.online:443:76.76.21.21 https://redasistir.online/api/health
```

Probar también desde datos móviles, por si el problema es del proveedor de internet.

## Correo `info@redasistir.online`

1. Crear la casilla en el panel de DonWeb y anotar servidor SMTP, puertos (465 TLS / 587 STARTTLS), usuario y contraseña → variables `SMTP_*` (ver `docs/env.md`).
2. **SPF:** un único registro TXT en la raíz. Ejemplo (reemplazar por lo que indique DonWeb): `v=spf1 include:<dominio SPF de DonWeb> ~all`. Si ya existe un SPF, se combina en uno solo (dos registros SPF invalidan ambos).
3. **DKIM:** DonWeb entrega un selector y una clave pública: se carga como TXT en `<selector>._domainkey`.
4. **DMARC:** TXT en `_dmarc` con `v=DMARC1; p=none; rua=mailto:info@redasistir.online` al empezar; pasar a `quarantine` cuando los informes salgan limpios.
5. **Si Supabase Auth manda los códigos de ingreso por este mismo SMTP** (ver `docs/env.md`), el volumen de mails sube: revisar los límites de envío por hora de la casilla en DonWeb.

## Prueba (F6)

Con la API desplegada y las variables cargadas: iniciar sesión como admin y usar Admin › Correos › «Enviar mail de prueba» (`POST /admin/mail/test`) a una casilla de Gmail y a una de Outlook. **Aceptación:** llega a la bandeja de entrada (no a spam) y, en el original del mensaje, SPF/DKIM/DMARC figuran como `pass`.
