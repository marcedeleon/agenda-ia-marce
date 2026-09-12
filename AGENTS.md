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
  webhooks/whatsapp.ts rutas GET/POST /webhook/whatsapp (Meta) + verificación de firma
  services/whatsapp/   client (Cloud API), handler (whitelist + logging + reply),
                       parse (extracción de mensajes), types
  services/gemini/     classifier (Google GenAI SDK), types (zod del JSON estructurado)
  services/agenda/     repository (usuarios/agenda/tareas, consultas), format (respuestas)
  lib/date.ts          helpers de fecha en zona America/Argentina/Buenos_Aires
tests/                 *.test.ts (corren contra Postgres local/CI, serializados en vitest)
prisma/                schema.prisma + migrations/
docs/                  ONBOARDING_WHATSAPP.md
```

## Webhook de WhatsApp (implementado en Fase 2)

- `GET /webhook/whatsapp` — verificación de Meta (`hub.challenge` + `WA_WEBHOOK_VERIFY_TOKEN`).
- `POST /webhook/whatsapp` — responde 200 al toque y procesa en background; si `WA_APP_SECRET`
  está seteado, valida `X-Hub-Signature-256`.
- El flujo: `parse` → whitelist (`AGENDA_OWNERS_WHATSAPP`) → log INBOUND en `MessageLog` →
  reply placeholder → log OUTBOUND. Con `buildApp({ whatsappClient })` se inyecta un cliente
  simulado en tests.

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

## Flujo del bot (Fase 3: Gemini integrado)

- Texto → `classifier` (Gemini, JSON estructurado con schema) → intención:
  - `crear_tarea`: `ensureAgendaFor` (upsert usuario + agenda compartida única) → `Task` (+recurrencia)
    → confirmación en español.
  - `consultar_agenda`: rango hoy/mañana/semana/fecha/pendientes → listado.
  - `otros`: respuesta conversacional; imágenes/audio todavía placeholder.
- Las fechas relativas las resuelve Gemini contra `todayISO()` (zona `America/Argentina/Buenos_Aires`).
- En tests se inyecta `geminiClassifier` fake vía `buildApp({ geminiClassifier })`; el real se arma
  con `createGeminiClassifier(env.GEMINI_API_KEY, env.GEMINI_MODEL)` (default `gemini-2.5-flash`).

## Estado actual

Fase 1: esqueleto Fastify + Prisma 7 + Postgres + tests + CI. ✅
Fase 2: webhook de WhatsApp (verify + receive + whitelist + MessageLog + reply). ✅
Fase 3: Gemini clasifica intención y arma tareas/consultas (usuario+agenda se crean solos). ✅
Aún **no** implementados: leer imágenes/audio, marcar tareas hechas, scheduler de
recordatorios/resumen diario, tareas recurrentes generadas (el motor), seed real de agenda/usuarios.
