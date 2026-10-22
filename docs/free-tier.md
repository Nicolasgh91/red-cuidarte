# Capa gratuita — límites vigentes

Relevado el **2026-10-22** (spike S4) desde las páginas oficiales de cada proveedor. Los números cambian: volver a verificar antes de F10. Reemplaza la versión anterior, que describía Cloud Run, GraalVM y Artifact Registry (descartados por D4).

## Vercel Hobby (web y API)

| Recurso                            | Límite Hobby                                                                                                                               |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Invocaciones de funciones          | 1.000.000 por mes (guía de uso justo)                                                                                                      |
| CPU activa                         | 4 horas por mes                                                                                                                            |
| Memoria aprovisionada              | 360 GB-hora por mes                                                                                                                        |
| Fast Data Transfer                 | 100 GB por mes                                                                                                                             |
| Fast Origin Transfer               | 10 GB por mes                                                                                                                              |
| Duración de una función            | 300 s (default y máximo)                                                                                                                   |
| Memoria / CPU por función          | 2 GB / 1 vCPU                                                                                                                              |
| Regiones de funciones              | **una sola región** (default `iad1`, Washington D.C.)                                                                                      |
| Cron jobs                          | hasta 100 por proyecto; en Hobby corren una vez por día (D6)                                                                               |
| Deploys                            | 100 por día y 100 por hora; 1 build concurrente; 45 min de build                                                                           |
| Logs de ejecución                  | se guardan **1 hora**                                                                                                                      |
| Proyectos conectados al mismo repo | 25                                                                                                                                         |
| Repos de organizaciones de Git     | **no se pueden conectar** en Hobby (el repo es de la cuenta personal `Nicolasgh91`: sirve; si se mueve a una organización, hace falta Pro) |
| Uso comercial                      | **prohibido** (D2): cualquier despliegue usado para el beneficio económico de cualquiera que participe en su producción                    |

Consecuencias para el proyecto:

- La región es única y el default es `iad1`. Hay que elegir la región de la función según la región de `cuidarte-prod` (decisión de Nico al crear/ver el proyecto de Supabase). Sin eso, cada consulta cruza continentes (spike S2e).
- Los logs duran 1 hora: para investigar un problema hay que mirarlos enseguida (checklist de F10).

Fuentes: https://vercel.com/docs/limits · https://vercel.com/docs/limits/fair-use-guidelines · https://vercel.com/docs/functions/configuring-functions/region

## Groq (asistente)

Tabla oficial de límites (la página aclara que son los límites base del plan Developer; los del plan gratuito se ven en la consola de la cuenta):

| Modelo                    | Pedidos/min                      | Pedidos/día | Tokens/min | Tokens/día |
| ------------------------- | -------------------------------- | ----------- | ---------- | ---------- |
| `openai/gpt-oss-120b`     | 30                               | 1.000       | 8.000      | 200.000    |
| `openai/gpt-oss-20b`      | 30                               | 1.000       | 8.000      | 200.000    |
| `qwen/qwen3.8-27b`        | 30                               | 1.000       | 8.000      | 200.000    |
| `llama-3.3-70b-versatile` | no figura en la tabla de límites |             |            |            |

- Tool calling: la página oficial indica que todos los modelos alojados lo soportan (`gpt-oss-*`: sin llamadas paralelas; `qwen3.8-27b` y `llama-3.3-70b-versatile`: con llamadas paralelas). Que además responda bien en español con `listar_turnos`/`agregar_turnos` **se confirma recién en S3** (hace falta la API key).
- **Riesgo detectado:** el tope de **8.000 tokens por minuto y 200.000 por día es de toda la organización, no por usuario**. El contexto fijo del asistente (reglas, FAQ, recursos y herramientas) pesa ~2.200 tokens por pedido, y una consulta con herramientas hace dos llamadas. Eso alcanza para ~3 pedidos por minuto y del orden de 50–90 consultas por día entre **todos** los usuarios. El límite propio de 20 mensajes por usuario por día no protege este tope. Si el uso real lo supera, las opciones son recortar el contexto (resúmenes de los recursos), subir de plan o cambiar de proveedor: es decisión de Nico, no se resolvió acá.
- El modelo por defecto del código es `openai/gpt-oss-120b` (variable `GROQ_MODEL`); S3 puede cambiarlo.

Fuentes: https://console.groq.com/docs/rate-limits · https://console.groq.com/docs/tool-use

## Supabase (plan Free)

- Base de datos: 500 MB por proyecto (CPU compartida, 500 MB de RAM).
- Egress: 5 GB (+5 GB cacheado). Storage de archivos: 1 GB.
- Auth: 50.000 usuarios activos por mes.
- Hasta 2 proyectos activos (`cuidarte-prod` y `cuidarte-dev`: justo el cupo).
- Los proyectos se pausan tras 1 semana sin actividad (el cron de F7 lo evita; **un cron que falle durante 7 días pausa producción**).
- **Sin verificar:** cantidad de conexiones del pooler en Free (la página de precios no lo indica). La API abre 1 conexión por instancia (`max: 1`).
- **Sin verificar:** límite de envío de mails de Supabase Auth con su SMTP por defecto; el login por código por mail necesita SMTP propio (ver `docs/env.md`).

Fuente: https://supabase.com/pricing

## GitHub Actions (plan Free, repos privados)

- 2.000 minutos por mes (Linux). Tarifas por minuto: Linux 2 núcleos US$ 0,006; Windows US$ 0,010; macOS US$ 0,062 (el macOS equivale a ~10 minutos de Linux por minuto real: relevante para un build de iOS, D3).
- Artifacts: 500 MB (compartido con Packages). Caché: 10 GB por repo.
- `backup.yml` guarda 21 días de retención: con volcados chicos entra de sobra; revisar el tamaño si la base crece.

Fuente: https://docs.github.com/en/billing/managing-billing-for-your-products/about-billing-for-github-actions
