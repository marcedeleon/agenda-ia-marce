import { logger } from '../../lib/logger.js';

export interface SendTextParams {
  phoneNumberId: string;
  to: string;
  text: string;
}

export interface SendTextResult {
  waMessageId: string;
}

/**
 * Cliente de la WhatsApp Cloud API (Meta).
 * Encapsula el envío de mensajes; el `http` se puede inyectar para testear.
 */
export class WhatsAppClient {
  constructor(
    private readonly token: string,
    private readonly apiVersion: string,
    private readonly http: typeof fetch = fetch,
  ) {}

  async sendText({ phoneNumberId, to, text }: SendTextParams): Promise<SendTextResult> {
    const url = `https://graph.facebook.com/${this.apiVersion}/${phoneNumberId}/messages`;

    const res = await this.http(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to,
        type: 'text',
        text: { preview_url: false, body: text },
      }),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      logger.error(
        { status: res.status, detail: detail.slice(0, 300) },
        'La API de WhatsApp rechazó el envío',
      );
      throw new Error(`WhatsApp API respondió ${res.status}: ${detail.slice(0, 300)}`);
    }

    const data = (await res.json()) as { messages?: Array<{ id: string }> };
    return { waMessageId: data.messages?.[0]?.id ?? '' };
  }
}
