# Cuidarte+

App para personas que cuidan a adultos mayores (Red Cuidar): turnos, tareas, bienestar, pausas guiadas, recordatorios y un asistente.

- Fuente de verdad funcional: [`tasks/spec-v2.md`](tasks/spec-v2.md). Plan de ejecución: [`tasks/roadmap.md`](tasks/roadmap.md). Estado: [`tasks/progress.md`](tasks/progress.md).
- Referencia visual: [`tasks/prototipo-cuidarte.html`](tasks/prototipo-cuidarte.html).
- Arquitectura: [`docs/architecture.md`](docs/architecture.md) · decisiones: [`docs/decisions.md`](docs/decisions.md) · variables de entorno: [`docs/env.md`](docs/env.md) · límites de las capas gratuitas: [`docs/free-tier.md`](docs/free-tier.md).

## Estructura

```
apps/api/      Hono + TypeScript sobre Vercel Functions (api.redasistir.online)
apps/web/      React + Vite + TypeScript (PWA) y Capacitor (android/)
supabase/      migrations/ (SQL), seed/, config.toml
scripts/       migración local y restauración de backups
docs/          documentación
.github/       CI, migraciones a producción, backup semanal
```

## Desarrollo local

Requisitos: Node 22+ (se usa 24), pnpm 11, Docker.

```bash
pnpm install
docker compose up -d db        # Postgres local en el puerto 54329
pnpm db:migrate                # aplica supabase/migrations a la base "cuidarte"
pnpm lint && pnpm typecheck && pnpm test
```

Los tests de la API crean y limpian su propia base (`cuidarte_test`) en el Postgres local; en CI usan un servicio de Postgres.

Para correr la API en local hace falta `apps/api/.env.local` (ver `apps/api/.env.example` y `docs/env.md`), luego `pnpm --filter api dev`.

## Reglas del repo

- Los secretos nunca van en el repo (GitHub Secrets y variables de Vercel).
- Los cambios de esquema llegan a producción solo por migraciones aplicadas desde CI (`migrate.yml`); primero se prueban en `cuidarte-dev`.
- Código, identificadores, rutas y commits en inglés; documentación y textos de la app en español rioplatense.
