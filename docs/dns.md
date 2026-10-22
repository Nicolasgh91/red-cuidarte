# DNS y correo en DonWeb (👤 Nico)

Dominio `redasistir.online`, DNS administrado en DonWeb. Los valores exactos los dan Vercel y DonWeb al cargar el dominio; acá está qué registros hay que crear y por qué. Verificar cada uno con `dig`/`nslookup` después de cargarlo (la propagación puede tardar).

## Vercel

Agregar los dominios en cada proyecto de Vercel (Settings › Domains) y cargar lo que Vercel indique:

| Nombre                     | Tipo                                   | Valor                                                                       | Proyecto                   |
| -------------------------- | -------------------------------------- | --------------------------------------------------------------------------- | -------------------------- |
| `redasistir.online` (raíz) | A (o ALIAS/ANAME si DonWeb lo permite) | el que muestre Vercel (hoy `76.76.21.21`)                                   | `web`                      |
| `www`                      | CNAME                                  | el que muestre Vercel                                                       | `web` (redirige a la raíz) |
| `api`                      | CNAME                                  | el que muestre Vercel (`cname.vercel-dns.com` o el específico del proyecto) | `api`                      |

Vercel emite los certificados HTTPS solo cuando el DNS resuelve bien. Los archivos `/.well-known/assetlinks.json` (Android) y `apple-app-site-association` (iOS, F9b) se sirven desde el proyecto `web` (ver `docs/assetlinks.md`).

## Correo `avisos@redasistir.online`

1. Crear la casilla en el panel de DonWeb y anotar servidor SMTP, puertos (465 TLS / 587 STARTTLS), usuario y contraseña → variables `SMTP_*` (ver `docs/env.md`).
2. **SPF:** un único registro TXT en la raíz. Ejemplo (reemplazar por lo que indique DonWeb): `v=spf1 include:<dominio SPF de DonWeb> ~all`. Si ya existe un SPF, se combina en uno solo (dos registros SPF invalidan ambos).
3. **DKIM:** DonWeb entrega un selector y una clave pública: se carga como TXT en `<selector>._domainkey`.
4. **DMARC:** TXT en `_dmarc` con `v=DMARC1; p=none; rua=mailto:avisos@redasistir.online` al empezar; pasar a `quarantine` cuando los informes salgan limpios.
5. **Si Supabase Auth manda los códigos de ingreso por este mismo SMTP** (ver `docs/env.md`), el volumen de mails sube: revisar los límites de envío por hora de la casilla en DonWeb.

## Prueba (F6)

Con la API desplegada y las variables cargadas: iniciar sesión como admin y usar Admin › Correos › «Enviar mail de prueba» (`POST /admin/mail/test`) a una casilla de Gmail y a una de Outlook. **Aceptación:** llega a la bandeja de entrada (no a spam) y, en el original del mensaje, SPF/DKIM/DMARC figuran como `pass`.
