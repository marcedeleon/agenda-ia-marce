import { randomUUID } from 'node:crypto';
import { logger } from '../../lib/logger.js';
import { prisma } from '../../lib/prisma.js';
import { todayISO } from '../../lib/date.js';
import type { WhatsAppClient } from './client.js';
import type { NormalizedMessage } from './types.js';
import type { Classifier, ClassifiedMessage } from '../gemini/classifier.js';
import {
  createTask,
  ensureAgendaFor,
  queryAgendaTasks,
  queryHeader,
  resolveQueryScope,
} from '../agenda/repository.js';
import { formatTaskConfirmation, formatTaskList } from '../agenda/format.js';

export interface ProcessMessageOptions {
  client: Pick<WhatsAppClient, 'sendText'>;
  phoneNumberId: string;
  allowedNumbers: string[];
  classifier: Classifier;
}

const IMAGE_PLACEHOLDER_REPLY =
  'Recibí tu imagen.\n\nTodavía no puedo leerla (eso llega en la próxima fase). Mientras, describime lo que quieras agendar por texto.';

const GENERIC_REPLY =
  'Por ahora solo proceso texto. Mandame una tarea (ej: "comprar leche el viernes") o preguntame "¿qué tengo hoy?".';

const OTHERS_REPLY =
  '¡Hola! Soy la agenda del grupo. Mandame lo que haya que agendar (por ejemplo: "sacar turno con el médico el viernes") o preguntame "¿qué tengo hoy?".';

const ERROR_REPLY = 'Mirá, tuve un problema para procesar eso. Probá de nuevo con otras palabras.';

async function buildReplyForClassification(
  message: NormalizedMessage,
  classified: ClassifiedMessage,
): Promise<string> {
  switch (classified.intent) {
    case 'crear_tarea': {
      const task = classified.task;
      if (!task) return OTHERS_REPLY;
      const { agendaId, userId } = await ensureAgendaFor(message.waPhone);
      const created = await createTask(agendaId, userId, {
        title: task.titulo,
        description: task.descripcion,
        fecha: task.fecha,
        hora: task.hora,
        recurrence: task.recurrencia,
      });
      return formatTaskConfirmation(created);
    }
    case 'consultar_agenda': {
      const scope = resolveQueryScope(classified.queryReference);
      const { agendaId } = await ensureAgendaFor(message.waPhone);
      const tasks = await queryAgendaTasks(agendaId, scope);
      return formatTaskList(queryHeader(scope), tasks);
    }
    default:
      return OTHERS_REPLY;
  }
}

/**
 * Procesa un mensaje entrante:
 * 1. Valida whitelist y registra el mensaje (INBOUND).
 * 2. Clasifica con Gemini y responde (crea tareas o contesta consultas).
 * 3. Registra la respuesta (OUTBOUND).
 */
export async function processInboundMessage(
  message: NormalizedMessage,
  options: ProcessMessageOptions,
): Promise<void> {
  const { client, phoneNumberId, allowedNumbers, classifier } = options;

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

  let reply: string;
  try {
    if (message.type === 'image') {
      reply = IMAGE_PLACEHOLDER_REPLY;
    } else if (message.type !== 'text' || !message.text) {
      reply = GENERIC_REPLY;
    } else {
      const classified = await classifier({ text: message.text, todayISO: todayISO() });
      reply = await buildReplyForClassification(message, classified);
    }
  } catch (err) {
    logger.error({ err, waMessageId: message.waMessageId }, 'Error armando la respuesta');
    reply = ERROR_REPLY;
  }

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
