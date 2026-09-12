# Agenda IA Marce

Agenda compartida con IA a través de WhatsApp. Dos personas le escriben al mismo número del bot
(texto o fotos de notas, facturas, pizarras, etc.) y **Google Gemini** interpreta el contenido,
arma una agenda en común en **PostgreSQL** y avisa las tareas del día con un resumen diario.

El bot responde en español: confirma tareas, responde consultas ("¿qué tengo mañana?") y maneja
tareas recurrentes ("todos los lunes pagar la expensa").

## Stack

| Capa          | Tecnología                                 |
| ------------- | ------------------------------------------ |
| WhatsApp      | Meta WhatsApp Cloud API (Business oficial) |
| IA            | Google Gemini (`@google/genai`)            |
| Backend       | Node.js 22+ · TypeScript strict · Fastify  |
| Base de datos | PostgreSQL 16 · Prisma 7 (driver adapter)  |
| Scheduler     | node-cron (resumen diario, recurrentes)    |
| Tests         | Vitest                                     |
| Calidad       | ESLint + Prettier + GitHub Actions CI      |

## Requisitos

- Node.js 20+ (recomendado 22 LTS)
- Docker Desktop (para PostgreSQL local)
- `gh` CLI con sesión iniciada (para tareas del repo)

## Puesta en marcha (desarrollo)

```bash
# 1. Clonar e instalar
git clone https://github.com/marcedeleon/agenda-ia-marce.git
cd agenda-ia-marce
npm install

# 2. Configurar entorno
cp .env.example .env
#    editar .env con tus valores reales

# 3. Levantar PostgreSQL y aplicar migraciones
docker compose up -d postgres
npm run db:generate   # genera el cliente Prisma en src/generated
npm run db:migrate    # aplica migraciones

# 4. Correr en desarrollo (hot reload)
npm run dev
```

## Scripts útiles

| Comando              | Descripción                         |
| -------------------- | ----------------------------------- |
| `npm run dev`        | Servidor con hot reload (tsx watch) |
| `npm run build`      | Compila a `dist/`                   |
| `npm start`          | Corre el build en producción        |
| `npm run typecheck`  | Tipos                               |
| `npm run lint`       | ESLint                              |
| `npm test`           | Vitest (unit + integración)         |
| `npm run db:migrate` | `prisma migrate dev`                |
| `npm run db:studio`  | Prisma Studio (navegador de datos)  |

## Estructura

```
src/
  config/     validación de entorno (zod)
  lib/        prisma singleton, logger
  routes/     rutas Fastify (health, status)
  services/   whatsapp, gemini, agenda, scheduler
  webhooks/   controlador del webhook de Meta
prisma/
  schema.prisma
  migrations/
docs/         guías (onboarding de WhatsApp, arquitectura)
```

## Onboarding de WhatsApp (Manual)

La integración con Meta requiere pasos en el portal de Meta Developers y la aprobación de un
template. Seguí la guía en **[docs/ONBOARDING_WHATSAPP.md](docs/ONBOARDING_WHATSAPP.md)**.

## Estado del proyecto

**Fases 1 y 2 (implementadas):** esqueleto del servidor con Fastify, Prisma 7 + PostgreSQL, tests
y CI; webhook de WhatsApp funcionando (verificación, recepción de mensajes, whitelist, log y
respuesta automática). La integración con Gemini y el resumen diario vienen en las fases siguientes.

## Convenciones

- Commits en inglés, estilo Conventional Commits (`feat:`, `fix:`, `chore:`...).
- Una feature = una rama + PR. `main` siempre verde (CI obliga).
- Sin secretos en el repo: todo entra por `.env` (ver `.env.example`).
- Tests obligatorios para código nuevo.

## Licencia

MIT — ver [LICENSE](LICENSE).
