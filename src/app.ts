import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify';
import { loggerConfig } from './lib/logger.js';
import { healthRoutes } from './routes/health.js';
import { whatsappWebhookRoutes } from './webhooks/whatsapp.js';
import type { WhatsAppClient } from './services/whatsapp/client.js';
import type { Classifier } from './services/gemini/classifier.js';

export interface BuildAppOptions {
  loggerEnabled?: boolean;
  /** Cliente de WhatsApp inyectable para tests. */
  whatsappClient?: Pick<WhatsAppClient, 'sendText'>;
  /** Clasificador de mensajes inyectable para tests. */
  geminiClassifier?: Classifier;
}

export interface RawBodyRequest {
  rawBody: string;
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

  // Parser JSON que retiene el body sin parsear para verificar la firma de Meta.
  app.addContentTypeParser('application/json', { parseAs: 'string' }, (request, body, done) => {
    try {
      (request as FastifyRequest & RawBodyRequest).rawBody =
        typeof body === 'string' ? body : String(body);
      done(null, JSON.parse(String(body)));
    } catch (err) {
      done(err as Error);
    }
  });

  app.register(healthRoutes);
  app.register(whatsappWebhookRoutes, {
    client: options.whatsappClient,
    classifier: options.geminiClassifier,
  });

  app.setErrorHandler((err, request, reply) => {
    request.log.error({ err }, 'Error no controlado');
    reply.status(500).send({ error: 'Internal Server Error' });
  });

  return app;
}
