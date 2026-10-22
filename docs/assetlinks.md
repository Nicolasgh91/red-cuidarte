# Passkeys en Android y en iOS: archivos de asociación de dominio

Las passkeys están ligadas al dominio (`rpId = redasistir.online`). Para que la app Android pueda usarlas, el dominio tiene que declarar la app. Estos archivos los sirve el proyecto `web` de Vercel desde `apps/web/public/.well-known/` (el de Android se agrega cuando se conozca el certificado; **no se inventa el hash**).

## Android — `/.well-known/assetlinks.json`

```json
[
  {
    "relation": [
      "delegate_permission/common.handle_all_urls",
      "delegate_permission/common.get_login_creds"
    ],
    "target": {
      "namespace": "android_app",
      "package_name": "online.redasistir.cuidarte",
      "sha256_cert_fingerprints": ["<SHA-256 del certificado de firma>"]
    }
  }
]
```

- Debe servirse con `Content-Type: application/json`, sin redirecciones, por HTTPS.
- La huella SHA-256 hay que cargar **las dos**: la del certificado de _debug_ (pruebas) y la de la clave de **App Signing de Google Play** (Play Console › Integridad de la app). Si se usa Play App Signing, la que vale en producción es la de Google, no la local.
- `package_name` coincide con `appId` de `capacitor.config.ts` (`online.redasistir.cuidarte`).
- Origen que llega a la API desde la app: `android:apk-key-hash:<base64url del SHA-256 del certificado>` → va en `WEBAUTHN_ORIGINS` (ver `docs/env.md`). La conversión de la huella hex a base64url: `echo "AA:BB:..." | tr -d ':' | xxd -r -p | basenc --base64url | tr -d '='`.

Verificación: https://digitalassetlinks.googleapis.com/v1/statements:list?source.web.site=https://redasistir.online&relation=delegate_permission/common.get_login_creds

## iOS (F9b, cuando se pague Apple Developer) — `/.well-known/apple-app-site-association`

Contiene `webcredentials` con `<TeamID>.<bundle id>`. Se completa en F9b con el Team ID real.
