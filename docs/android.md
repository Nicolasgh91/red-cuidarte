# App Android (Capacitor)

`apps/web` empaquetada con Capacitor 8. Proyecto nativo en `apps/web/android/` (versionado, salvo lo generado). `appId`: `online.redasistir.cuidarte` (no se puede cambiar después de publicar en Play).

## Estado (2026-10-22)

| Pieza                                                                                             | Estado                                                                     |
| ------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Proyecto Android generado, íconos (adaptativo vectorial + PNG para API 24–25), `ic_stat_cuidarte` | ✅ En el repo                                                              |
| Recordatorios con notificaciones locales (`apps/web/src/reminders/native.ts`)                     | ✅ Código y tests con el plugin simulado. **No probado en un teléfono**    |
| Botón de urgencia (`tel:`)                                                                        | ✅ Ya estaba en la web (`Layer.tsx`)                                       |
| `/privacidad` pública                                                                             | ✅ Borrador (revisión legal pendiente, F10)                                |
| `docs/play-data-safety.md`                                                                        | ✅ Borrador                                                                |
| Passkeys en la app                                                                                | ⛔ **Bloqueado por S1** (ver abajo)                                        |
| Compilar el APK/AAB                                                                               | ⛔ No hay Android SDK/Android Studio en esta máquina: **nunca se compiló** |
| Prueba en un Android real, Play Console, prueba interna                                           | 👤 Pendiente                                                               |

## Compilar (👤 en la Mac/PC de Nico, con Android Studio)

```bash
pnpm install
pnpm --filter web cap:sync   # build de la web + copia a android/
pnpm --filter web cap:open   # abre Android Studio; Run en un emulador o teléfono
```

`VITE_API_URL`, `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` se leen en el build (`apps/web/.env.local`). La API tiene que aceptar el origen de la app: `https://localhost` en `ALLOWED_ORIGINS` (el origen por defecto del WebView de Capacitor en Android).

## Recordatorios

- Se programan como notificaciones diarias fijas (`schedule.on {hour, minute}`) y se **reprograman** cada vez que cambia la configuración (guardar en Recordatorios, o al abrir la app y traer `GET /reminders`). El plugin las restaura al reiniciar el teléfono.
- **Sin alarma exacta:** el manifest quita `SCHEDULE_EXACT_ALARM` (Google Play restringe ese permiso a apps de alarmas/calendario). Android puede demorar un aviso unos minutos con el teléfono en reposo; para agua y estiramientos es aceptable. Si se necesita precisión, hay que pedir la declaración de alarmas exactas en Play.
- Permiso de notificaciones (Android 13+): se pide al guardar/abrir si todavía no se decidió. Si lo niegan, no se programa nada.
- **Para probar en un teléfono real:** configurar agua cada 30 minutos, cerrar la app (deslizarla de recientes) y esperar el aviso; repetir con la pantalla bloqueada y tras reiniciar. Aceptación del roadmap: «recordatorios sonando con la app cerrada».
- Fabricantes con ahorro de batería agresivo (Xiaomi, Huawei, Samsung) pueden matar las alarmas: documentar para el usuario que deshabilite la optimización de batería de Cuidarte+ si no suenan.

## Passkeys (S1 pendiente)

El WebView de Capacitor sirve la app desde `https://localhost`, que **no coincide** con el `rpId` `redasistir.online`: el WebAuthn del WebView no sirve. Hace falta un plugin nativo (Credential Manager) + `assetlinks.json` (`docs/assetlinks.md`) + el origen `android:apk-key-hash:…` en `WEBAUTHN_ORIGINS`. Candidatos y procedimiento en `docs/spikes.md` (S1).

El cliente ya está preparado: la interfaz `Passkeys` (`apps/web/src/auth/deviceFlow.ts`) es el punto de enchufe; hoy usa `@simplewebauthn/browser`. **Hasta que S1 se resuelva, en la app Android el paso de verificar el dispositivo no va a funcionar**, así que la app no es usable en producción. No se instaló ningún plugin de passkeys sin haberlo probado.

## Publicar

- Firmar con la clave de subida; activar Play App Signing y cargar **ambas** huellas SHA-256 en `assetlinks.json`.
- Política: `https://redasistir.online/privacidad` y formulario de seguridad de datos (`docs/play-data-safety.md`).
- Declaración de apps de salud en Play Console (la app maneja datos de salud).
