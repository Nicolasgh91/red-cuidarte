# Passkeys

Cada cuenta tiene **una** passkey y se usa siempre con verificación de usuario (huella, rostro o PIN). Cómo funciona el ingreso: [`architecture.md` §5](architecture.md#5-ingreso-y-passkey).

## Requisitos

- **Bloqueo de pantalla activado** (código, huella, rostro o PIN de Windows Hello). Sin él, el equipo no puede crear la passkey.
- **Entrar desde `https://redasistir.online`**: ni `www`, ni la URL de Vercel. La passkey queda atada a ese dominio.
- **Un navegador común** (Chrome, Safari, Edge, Firefox) actualizado. El navegador interno de WhatsApp, Instagram o Facebook no sirve: hay que abrir el enlace en el navegador.

## Dónde se guarda y alternativas

| Equipo                  | Dónde queda la passkey                                                     | Si no se puede en ese equipo                   |
| ----------------------- | -------------------------------------------------------------------------- | ---------------------------------------------- |
| iPhone / iPad (iOS 16+) | Llavero de iCloud (o el gestor elegido en Ajustes › Contraseñas)           | Llave de seguridad con PIN                     |
| Mac                     | Llavero de iCloud (Safari) o Google Password Manager (Chrome)              | Teléfono con el código QR · llave de seguridad |
| Android (9+)            | Google Password Manager (o el gestor elegido, como Samsung Pass)           | Llave de seguridad con PIN (USB o NFC)         |
| Windows 10/11           | Windows Hello o Google Password Manager (Chrome)                           | Teléfono con el código QR · llave de seguridad |
| ChromeOS / Linux        | Google Password Manager (Chrome)                                           | Teléfono con el código QR · llave de seguridad |
| App Android (Capacitor) | Todavía no funciona ([`android.md`](android.md#passkeys-y-assetlinksjson)) | Usar la web en el navegador del teléfono       |

- **Código QR:** en la computadora se elige «usar un teléfono o tablet» y se escanea con la cámara. Necesita Bluetooth prendido en los dos equipos. La passkey queda en el teléfono y para ingresar se repite el QR.
- **Passkey sincronizada** (iCloud o Google): sirve en los otros equipos de la misma cuenta de Apple o Google sin registrar nada más.
- **Último recurso:** el administrador restablece la passkey (Dispositivos › Restablecer passkey) y el próximo ingreso registra una nueva.

## Errores

| Mensaje / código                                                | Causa                                        | Qué hacer                                                                                                       |
| --------------------------------------------------------------- | -------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| «No se completó la verificación»                                | Se canceló el diálogo o venció el tiempo     | Tocar el botón de nuevo; si la passkey está en otro equipo, usar el QR                                          |
| «Activá el bloqueo de pantalla» · `webauthn_user_verification`  | El equipo no hizo la verificación de usuario | Activar el bloqueo de pantalla o usar el teléfono con QR                                                        |
| «Esta dirección no está habilitada» · `webauthn_origin`         | La página no coincide con `WEBAUTHN_ORIGINS` | Entrar desde `https://redasistir.online`. Si ya se está ahí, revisar la variable en Vercel ([`ops.md`](ops.md)) |
| «Se cruzaron dos intentos» · `webauthn_challenge`               | Otra pestaña pidió un desafío nuevo          | Cerrar las otras pestañas y probar de nuevo                                                                     |
| «El desafío venció» · `challenge_expired`                       | Pasaron más de 5 minutos                     | Probar de nuevo                                                                                                 |
| «No pudimos registrar/verificar tu passkey» · `webauthn_failed` | Otro rechazo de la verificación              | Ver el log `[webauthn]` de la API en Vercel: trae el error, el origen recibido y el esperado                    |

Si un registro falla, la passkey puede quedar guardada en el gestor aunque la cuenta no la tenga: se borra a mano (figura como «Cuidarte+»).
