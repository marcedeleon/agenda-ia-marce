import { createHmac, timingSafeEqual } from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { loadEnv } from '../config/env.js';
import { logger } from '../lib/logger.js';
import type { RawBodyRequest } from '../app.js';
import { WhatsAppClient } from '../services/whatsapp/client.js';
import type { WhatsAppWebhookPayload } from '../services/whatsapp/types.js';
import { extractMessages } from '../services/whatsapp/parse.js';
import { processInboundMessage } from '../services/whatsapp/handler.js';

export interface WhatsappWebhookOptions {
  client?: Pick<WhatsAppClient, 'sendText'>;
}

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

function verifySignature(rawBody: string, signature: string | undefined, secret: string): boolean {
  if (!signature) return false;
  const expected = `sha256=${createHmac('sha256', secret).update(rawBody).digest('hex')}`;
  return safeEqual(signature, expected);
}

/**
 * Puntos de entrada del webhook de WhatsApp (Meta).
 *
 * GET  — verificación inicial (`hub.challenge`).
 * POST — recepción de mensajes; responde 200 al toque y procesa en background.
 */
export async function whatsappWebhookRoutes(
  app: FastifyInstance,
  options: WhatsappWebhookOptions = {},
): Promise<void> {
  app.get('/webhook/whatsapp', async (request, reply) => {
    const env = loadEnv();
    const query = request.query as Record<string, string | undefined>;

    if (
      query['hub.mode'] === 'subscribe' &&
      safeEqual(query['hub.verify_token'] ?? '', env.WA_WEBHOOK_VERIFY_TOKEN)
    ) {
      return reply.type('text/plain').send(query['hub.challenge'] ?? '');
    }

    return reply.status(403).send('Verification failed');
  });

  app.post('/webhook/whatsapp', async (request, reply) => {
    const env = loadEnv();

    if (env.WA_APP_SECRET) {
      const rawBody = (request as FastifyRequest & RawBodyRequest).rawBody ?? '';
      const signature = request.headers['x-hub-signature-256'] as string | undefined;
      if (!verifySignature(rawBody, signature, env.WA_APP_SECRET)) {
        logger.warn('Firma de webhook inválida, se rechaza');
        return reply.status(401).send('Invalid signature');
      }
    }

    const payload = request.body as WhatsAppWebhookPayload;

    // Responder ya: Meta reintenta si no hay 200 rápido.
    reply.code(200).send({ status: 'received' });

    const messages = extractMessages(payload);
    if (messages.length === 0) return;

    const client =
      options.client ?? new WhatsAppClient(env.META_WA_TOKEN, env.WA_GRAPH_API_VERSION);

    for (const message of messages) {
      void processInboundMessage(message, {
        client,
        phoneNumberId: env.WA_PHONE_NUMBER_ID,
        allowedNumbers: env.AGENDA_OWNERS_WHATSAPP,
      }).catch((err) => {
        logger.error(
          { err, waMessageId: message.waMessageId },
          'Fallo procesando mensaje entrante',
        );
      });
    }
  });
}
