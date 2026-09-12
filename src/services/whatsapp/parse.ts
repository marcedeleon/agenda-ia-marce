import type { NormalizedMessage, WhatsAppWebhookPayload } from './types.js';

/**
 * Extrae los mensajes entrantes del payload del webhook de Meta.
 * Ignora confirmaciones de entrega (statuses) y cambios de otros campos.
 */
export function extractMessages(payload: WhatsAppWebhookPayload): NormalizedMessage[] {
  const messages: NormalizedMessage[] = [];

  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      if (change.field !== 'messages') continue;

      for (const raw of change.value.messages ?? []) {
        const message: NormalizedMessage = {
          waPhone: raw.from,
          waMessageId: raw.id,
          timestamp: raw.timestamp,
          type: raw.type,
        };

        if (raw.type === 'text') {
          message.text = raw.text?.body ?? '';
        } else if (raw.type === 'image') {
          message.mediaId = raw.image?.id;
          message.mimeType = raw.image?.mime_type;
        }

        messages.push(message);
      }
    }
  }

  return messages;
}
