import { randomUUID } from 'node:crypto';
import { logger } from '../../lib/logger.js';
import { prisma } from '../../lib/prisma.js';
import type { WhatsAppClient } from './client.js';
import type { NormalizedMessage } from './types.js';

export interface ProcessMessageOptions {
  client: Pick<WhatsAppClient, 'sendText'>;
  phoneNumberId: string;
  allowedNumbers: string[];
}

const TEXT_PLACEHOLDER_REPLY = (body: string): string =>
  `Recibido, tomo nota de:\n"${truncate(body, 120)}"\n\nLa IA todavía está en obras: en la próxima fase esto se transforma en una tarea de la agenda y te aviso cuando toca. Seguí mandando lo que se les ocurra.`;

const IMAGE_PLACEHOLDER_REPLY =
  'Recibí tu imagen.\n\nEn la próxima fase voy a poder leerla (fotos de notas, facturas, pizarras...) y pasarla a la agenda. Quedate atento.';

const GENERIC_PLACEHOLDER_REPLY = 'Recibido, quedó anotado.';

function buildPlaceholderReply(message: NormalizedMessage): string {
  if (message.type === 'image') return IMAGE_PLACEHOLDER_REPLY;
  if (message.type === 'text' && message.text) return TEXT_PLACEHOLDER_REPLY(message.text);
  return GENERIC_PLACEHOLDER_REPLY;
}

function truncate(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max - 1)}…`;
}

/**
 * Procesa un mensaje entrante:
 * 1. Valida que el número esté autorizado (whitelist de la agenda).
 * 2. Registra el mensaje en MessageLog.
 * 3. Responde al usuario (placeholder hasta que Gemini tome el control).
 */
export async function processInboundMessage(
  message: NormalizedMessage,
  options: ProcessMessageOptions,
): Promise<void> {
  const { client, phoneNumberId, allowedNumbers } = options;

  if (!allowedNumbers.includes(message.waPhone)) {
    logger.warn(
      { waPhone: message.waPhone, waMessageId: message.waMessageId },
      'Número no autorizado, mensaje ignorado',
    );
    return;
  }

  try {
    await prisma.messageLog.create({
      data: {
        waPhone: message.waPhone,
        waMessageId: message.waMessageId,
        direction: 'INBOUND',
        type: message.type,
        mimeType: message.mimeType,
        text: message.text,
        intent: null,
      },
    });
  } catch (err) {
    // Duplicados de entrega de Meta pueden reintentar el mismo waMessageId.
    logger.warn({ err, waMessageId: message.waMessageId }, 'Ya registrado el mensaje entrante');
  }

  const reply = buildPlaceholderReply(message);

  try {
    const { waMessageId } = await client.sendText({
      phoneNumberId,
      to: message.waPhone,
      text: reply,
    });

    await prisma.messageLog.create({
      data: {
        waPhone: message.waPhone,
        waMessageId: waMessageId || `out.${randomUUID()}`,
        direction: 'OUTBOUND',
        type: 'text',
        text: reply,
      },
    });
  } catch (err) {
    logger.error({ err, waPhone: message.waPhone }, 'No se pudo enviar la respuesta');
  }
}
