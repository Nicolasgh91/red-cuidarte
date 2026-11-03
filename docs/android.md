# App Android (Capacitor)

`apps/web` empaquetada con Capacitor 8. Proyecto nativo en `apps/web/android/` (versionado, salvo lo generado). `appId`: `online.redasistir.cuidarte` (no se puede cambiar después de publicar en Play).

## Estado (2026-11-01)

| Pieza                                                                                             | Estado                                                               |
| ------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| Proyecto Android generado, íconos (adaptativo vectorial + PNG para API 24–25), `ic_stat_cuidarte` | Listo, en el repo                                                    |
| Recordatorios con notificaciones locales (`apps/web/src/reminders/native.ts`)                     | Código y tests con el plugin simulado. **No probado en un teléfono** |
| Botón de urgencia (`tel:`)                                                                        | Listo, compartido con la web (`Layer.tsx`)                           |
| `/privacidad` pública                                                                             | Borrador (revisión legal pendiente)                                  |
| [`play-data-safety.md`](play-data-safety.md)                                                      | Borrador                                                             |
| Passkeys en la app                                                                                | **Bloqueado** (ver [Passkeys](#passkeys-y-assetlinksjson))           |
| Compilar el APK/AAB                                                                               | **Pendiente**: nunca se compiló                                      |
| Prueba en un Android real, Play Console, prueba interna                                           | Pendiente                                                            |

Lo que falta para publicar está en [`pendientes.md`](pendientes.md#9-checklist-de-lanzamiento).

## Compilar (con Android Studio)

```bash
pnpm install
pnpm --filter web cap:sync   # build de la web + copia a android/
pnpm --filter web cap:open   # abre Android Studio; Run en un emulador o teléfono
```

`VITE_API_URL` (URL absoluta), `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` se leen en el build (`apps/web/.env.local`). La API tiene que aceptar el origen de la app: `https://localhost` (el origen del WebView de Capacitor) en `ALLOWED_ORIGINS` y en `NATIVE_ORIGINS` ([`ops.md`](ops.md#variables-de-entorno)).

## Recordatorios

- Se programan como notificaciones diarias fijas (`schedule.on {hour, minute}`) con el mismo cálculo de horarios que la web (`dailyReminders` en `reminders/scheduler.ts`) y se **reprograman** cada vez que cambia la configuración. El plugin las restaura al reiniciar el teléfono.
- **Sin alarma exacta:** el manifest quita `SCHEDULE_EXACT_ALARM` (Google Play lo restringe a apps de alarmas o calendario). Un aviso puede demorarse unos minutos con el teléfono en reposo.
- Permiso de notificaciones (Android 13+): lo pide la app al programar. Si lo niegan, no se programa nada. La tarjeta de permiso del navegador en Recordatorios se muestra solo en la web.
- **Prueba en un teléfono real:** agua cada 30 minutos, cerrar la app (deslizarla de recientes) y esperar el aviso; repetir con la pantalla bloqueada y tras reiniciar.
- Fabricantes con ahorro de batería agresivo (Xiaomi, Huawei, Samsung) pueden matar las alarmas: pedir que deshabiliten la optimización de batería para Cuidarte+ si no suenan.

## Passkeys y `assetlinks.json`

El WebView de Capacitor sirve la app desde `https://localhost`, que **no coincide** con el `rpId` `redasistir.online`: el WebAuthn del WebView no sirve. **Hasta resolverlo, el paso de la passkey no funciona en Android y la app no se puede usar en producción.**

Qué falta para habilitar passkeys en Android:

1. Elegir un plugin de passkeys para Capacitor 8 sobre Credential Manager. Candidatos encontrados (ninguno probado): `@capgo/capacitor-passkey`, `capacitor-webauthn`, `@capawesome/capacitor-passkeys`. Revisar licencia, código y soporte de `rpId` propio. Si ninguno anda, un plugin propio mínimo sobre `androidx.credentials`. Se enchufa en `apps/web/src/auth/passkeys.ts` (`registerPasskey` y `loginWithPasskey`).
2. Publicar `https://redasistir.online/.well-known/assetlinks.json` desde `apps/web/public/.well-known/` (con `Content-Type: application/json`, sin redirecciones):

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

   Cargar **las dos** huellas: la de _debug_ y la de **App Signing de Google Play** (Play Console › Integridad de la app), que es la que vale en producción. Usar siempre las huellas reales de los certificados.

3. Agregar a `WEBAUTHN_ORIGINS` el origen que manda la app: `android:apk-key-hash:<base64url del SHA-256>`. Conversión: `echo "AA:BB:..." | tr -d ':' | xxd -r -p | basenc --base64url | tr -d '='`.
4. En un emulador con Google Play: registrar una passkey desde la app, volver a ingresar y repetir desde Chrome Android (comparten el `rpId`).

Verificación del archivo: https://digitalassetlinks.googleapis.com/v1/statements:list?source.web.site=https://redasistir.online&relation=delegate_permission/common.get_login_creds

**Token de dispositivo en la app:** el WebView llama a la API desde otro sitio y no usa la cookie de la web. Para los orígenes de `NATIVE_ORIGINS` la API devuelve el token también en el cuerpo y lo acepta en `X-Device-Token`. Hoy se guarda en `localStorage` (`auth/deviceStore.ts`), igual que la sesión de supabase-js: **antes de publicar** hay que pasar los dos al almacenamiento seguro del sistema (Keystore), junto con la resolución de las passkeys.

**iOS** (cuando se pague Apple Developer): `/.well-known/apple-app-site-association` con `webcredentials` y `<TeamID>.<bundle id>`.

## Publicar

- Firmar con la clave de subida; activar Play App Signing y cargar **ambas** huellas en `assetlinks.json`.
- Política: `https://redasistir.online/privacidad` y formulario de seguridad de datos ([`play-data-safety.md`](play-data-safety.md)).
- Declaración de apps de salud en Play Console (la app maneja datos de salud).
