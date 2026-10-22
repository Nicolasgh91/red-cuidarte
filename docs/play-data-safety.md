# Google Play — formulario «Seguridad de los datos» (borrador)

Borrador para completar en Play Console, armado a partir del modelo de datos (`tasks/spec-v2.md`). **Requiere revisión legal (F10)**; no declarar nada que la revisión no confirme.

## Recopilación y uso compartido

| Categoría de Play                      | Dato                                                                                                             | Recopilado                                                                                | Compartido con terceros                                | Finalidad                                                             | Opcional                                             |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------ | --------------------------------------------------------------------- | ---------------------------------------------------- |
| Información personal                   | Nombre y apellidos                                                                                               | Sí                                                                                        | No¹                                                    | Funcionamiento de la app, gestión de la cuenta                        | No                                                   |
| Información personal                   | Dirección de correo                                                                                              | Sí                                                                                        | No¹                                                    | Gestión de la cuenta, comunicaciones (cumpleaños, códigos de ingreso) | No                                                   |
| Información personal                   | Número de teléfono                                                                                               | Sí                                                                                        | No                                                     | Gestión de la cuenta                                                  | No                                                   |
| Información personal                   | Fecha de nacimiento (otro tipo de info personal)                                                                 | Sí                                                                                        | No                                                     | Saludo de cumpleaños                                                  | No                                                   |
| Salud y estado físico                  | **Información de salud** (medicación de las personas cuidadas; registro de ánimo, energía y estrés del cuidador) | Sí                                                                                        | No¹                                                    | Funcionamiento de la app                                              | Bienestar: sí; medicación: la carga el administrador |
| Actividad de la app                    | Turnos y tareas completadas                                                                                      | Sí                                                                                        | No                                                     | Funcionamiento de la app                                              | No                                                   |
| Mensajes                               | Mensajes al asistente                                                                                            | Se envían a Groq para generar la respuesta; **la conversación no se guarda** en Cuidarte+ | Sí, con el proveedor del modelo (Groq) como procesador | Funcionamiento de la app                                              | Sí                                                   |
| Identificadores de dispositivo u otros | Credencial de passkey, etiqueta del dispositivo, dirección IP y user agent                                       | Sí                                                                                        | No                                                     | Seguridad (un dispositivo por cuenta) y auditoría                     | No                                                   |

¹ El procesamiento por Supabase (base y autenticación), Vercel (hosting) y el proveedor de correo se declara como «procesamiento de servicio», no como uso compartido, si la revisión legal lo confirma.

**No se recopila:** ubicación (el botón de urgencia solo marca un teléfono), contactos, fotos, audio, historial de navegación, identificadores publicitarios.

## Prácticas de seguridad

- Datos cifrados en tránsito (HTTPS): **Sí**.
- Datos cifrados en reposo: la base de Supabase está cifrada por el proveedor; la medicación además se cifra en la aplicación (AES-256-GCM).
- El usuario puede pedir que se borren sus datos: **Sí** — «Borrar mi cuenta» en Mi perfil borra perfil, bienestar, turnos y recordatorios. La URL para pedir el borrado es `https://redasistir.online/privacidad` (a completar con un contacto real tras la revisión legal).
- Cumple la política de Familias: **No** aplica (la app no está dirigida a menores).

## Otras declaraciones

- La app declara datos de salud: Play puede pedir la **declaración de apps de salud** (Políticas › Contenido de la app › Aplicaciones de salud). La app no es un dispositivo médico ni da diagnósticos; el texto de aviso del prototipo («no reemplaza el consejo médico profesional») debe figurar en la ficha.
- Público objetivo: adultos (cuidadores).
