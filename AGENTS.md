# AGENTS.md

Guía para agentes de IA y colaboradores que trabajan en este repositorio.

## Proyecto

**Agenda IA Marce** — agenda compartida con IA vía WhatsApp. Dos usuarios le escriben al bot
(texto o imágenes), Gemini lo convierte en tareas, se guardan en PostgreSQL y el bot responde
consultas y manda un resumen diario.

- Idioma del producto y del código (mensajes): **español**.
- Zona horaria de referencia: `America/Argentina/Buenos_Aires`.
- Repo: público, licencia MIT. Rama principal: `main`.

## Stack (no cambiar sin consulta)

- Node.js 22+ / ESM (`"type": "module"`)
- TypeScript **strict** (`noUncheckedIndexedAccess` activado)
- Fastify 5 — server HTTP y webhooks
- Prisma **7** con driver adapter `@prisma/adapter-pg` (ver nota abajo)
- PostgreSQL 16 (Docker local via `docker-compose.yml`)
- Vitest 5 para tests (unit + integración con Postgres real)
- ESLint 9 (flat config) + Prettier + GitHub Actions

## Comandos

```bash
npm install                 # instalar deps (genera src/generated vía db:generate)
npm run dev                 # servidor dev (tsx watch)
npm run build               # compila a dist/
npm start                   # corre el build
npm run typecheck           # tsc --noEmit
npm run lint                # eslint .
npm run format:check        # prettier --check
npm test                    # vitest run
npm run db:generate         # npx prisma generate
npm run db:migrate          # npx prisma migrate dev
npm run db:deploy           # npx prisma migrate deploy (producción/CI)
```

Flujo para arrancar en local:
`docker compose up -d postgres` → `cp .env.example .env` (editar valores) →
`npm run db:generate` → `npm run db:migrate` → `npm run dev`.

## Notas críticas de Prisma 7

- El `datasource.url` **vive en `prisma.config.ts`**, no en `schema.prisma`.
- El generator es `prisma-client` y emite a `src/generated/prisma` (gitignored).
  **Regeneralo siempre** tras tocar el schema: `npm run db:generate`.
- El cliente se importa de `../generated/prisma/client.js` (no de `@prisma/client`).
- El runtime usa driver adapter: `new PrismaClient({ adapter: new PrismaPg({ connectionString }) })`
  — ver `src/lib/prisma.ts`.
- `migrate dev` ya **no** genera el cliente ni hace seed automático: correr `db:generate` aparte.
- Vulnerabilidades altas en `npm audit` son transitivas del CLI de Prisma (deepmerge-ts, mysql2)
  para soporte MySQL que **no usamos**; no correr `audit fix --force` (bajaría a Prisma 6).

## Estructura

```
src/
  config/env.ts        validación con zod → loadEnv(); falla temprano
  lib/prisma.ts        singleton PrismaClient (adapter pg)
  lib/logger.ts        pino
  app.ts               buildApp() → instancia Fastify (testeable con inject)
  index.ts             arranque (env + listen + graceful shutdown)
  routes/              health, status
  services/            whatsapp, gemini, agenda, scheduler   (próximas fases)
  webhooks/            controller webhook de Meta            (próximas fases)
tests/                 *.test.ts (corren contra Postgres local/CI)
prisma/                schema.prisma + migrations/
docs/                  ONBOARDING_WHATSAPP.md
```

## Convenciones y reglas

1. **Commits**: Conventional Commits, en inglés (`feat:`, `fix:`, `chore:`, `test:`...),
   un cambio lógico por commit. Ver histórico con `git log --oneline`.
2. **Sin secretos**: nada de tokens/keys en el repo ni en commits. Todo por `.env` (ver
   `.env.example`). No commits `.env`.
3. **Tests**: código nuevo funcional requiere test. Los tests de integración asumen Postgres
   levantado (local o service container de CI).
4. **Verificación obligatoria antes de terminar**: `npm run typecheck` + `npm run lint` +
   `npm test` + `npm run build`.
5. **PRs**: working en ramas (`feat/*`, `fix/*`) y PR a `main`; CI debe pasar.
6. No agregar dependencias sin necesidad; si se agrega, justificar y actualizar `README`.
7. Mantener módulos con responsabilidad única; preferir cambios pequeños y revisables.
8. Mensajes del bot en español rioplatense; código y comentarios técnicos en inglés
   (excepciones: textos visibles al usuario).

## Estado actual

Fase 1: esqueleto Fastify + Prisma 7 + Postgres + tests + CI. Aún **no** implementados:
webhook de Meta, integración Gemini, scheduler de recordatorios, registro de mensajes, seed de
agenda/usuarios.
