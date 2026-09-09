import Fastify, { type FastifyInstance } from 'fastify';
import { loggerConfig } from './lib/logger.js';
import { healthRoutes } from './routes/health.js';

export interface BuildAppOptions {
  loggerEnabled?: boolean;
}

/**
 * Construye la instancia de Fastify junto con sus rutas.
 * Separada del arranque (index.ts) para poder testear con fastify.inject().
 */
export function buildApp(options: BuildAppOptions = {}): FastifyInstance {
  const app = Fastify({
    logger: options.loggerEnabled === false ? false : loggerConfig,
    bodyLimit: 1024 * 1024 * 5,
  });

  app.register(healthRoutes);

  app.setErrorHandler((err, request, reply) => {
    request.log.error({ err }, 'Error no controlado');
    reply.status(500).send({ error: 'Internal Server Error' });
  });

  return app;
}
