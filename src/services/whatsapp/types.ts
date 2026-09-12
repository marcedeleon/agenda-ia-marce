/** Estructura del payload que Meta envía al webhook (/webhook/whatsapp). */

export interface WhatsAppWebhookPayload {
  object: string;
  entry?: WhatsAppEntry[];
}

export interface WhatsAppEntry {
  id: string;
  changes?: WhatsAppChange[];
}

export interface WhatsAppChange {
  field: string;
  value: WhatsAppChangeValue;
}

export interface WhatsAppChangeValue {
  messaging_product: 'whatsapp';
  metadata?: {
    display_phone_number: string;
    phone_number_id: string;
  };
  contacts?: Array<{ profile: { name?: string }; wa_id: string }>;
  messages?: WhatsAppInboundMessage[];
  statuses?: Array<{ id: string; status: string }>;
}

/** Mensaje como llega en el payload (Meta agrega campos según el tipo). */
export interface WhatsAppInboundMessage {
  from: string;
  id: string;
  timestamp: string;
  type: string;
  text?: { body?: string };
  image?: { id: string; mime_type?: string };
}

/** Mensaje entrante normalizado, listo para procesar. */
export interface NormalizedMessage {
  waPhone: string;
  waMessageId: string;
  timestamp: string;
  type: string;
  text?: string;
  mediaId?: string;
  mimeType?: string;
}
