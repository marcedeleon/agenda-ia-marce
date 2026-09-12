import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import { extractMessages } from '../src/services/whatsapp/parse.js';
import type { WhatsAppWebhookPayload } from '../src/services/whatsapp/types.js';

const ALLOWED_PHONE = process.env.AGENDA_OWNERS_WHATSAPP?.split(',')[0] ?? '5491100000000';
let fakeSendCounter = 0;

class FakeWhatsAppClient {
  sendText = vi.fn(async (_: { phoneNumberId: string; to: string; text: string }) => ({
    waMessageId: `wamid.fake.${++fakeSendCounter}`,
  }));
}

const textPayload = (from: string, body: string, id: string): WhatsAppWebhookPayload => ({
  object: 'whatsapp_business_account',
  entry: [
    {
      id: 'waba_1',
      changes: [
        {
          field: 'messages',
          value: {
            messaging_product: 'whatsapp',
            metadata: { display_phone_number: '5491122223333', phone_number_id: '000000000000000' },
            contacts: [{ profile: { name: 'Test' }, wa_id: from }],
            messages: [{ from, id, timestamp: '1758254144', text: { body }, type: 'text' }],
          },
        },
      ],
    },
  ],
});

describe('Webhook de WhatsApp', () => {
  let app: FastifyInstance;
  let client: FakeWhatsAppClient;

  beforeAll(async () => {
    client = new FakeWhatsAppClient();
    app = buildApp({ loggerEnabled: false, whatsappClient: client });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    fakeSendCounter = 0;
    client.sendText.mockClear();
  });

  afterEach(async () => {
    await prisma.messageLog.deleteMany({ where: { waPhone: ALLOWED_PHONE } });
  });

  it('verifica el webhook (GET) con el token correcto', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/webhook/whatsapp',
      query: {
        'hub.mode': 'subscribe',
        'hub.verify_token': process.env.WA_WEBHOOK_VERIFY_TOKEN ?? 'elegi-un-token-secreto',
        'hub.challenge': '12345abc',
      },
    });
    expect(res.statusCode).toBe(200);
    expect(res.body).toBe('12345abc');
  });

  it('rechaza la verificación (GET) con token incorrecto', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/webhook/whatsapp',
      query: {
        'hub.mode': 'subscribe',
        'hub.verify_token': 'token-incorrecto',
        'hub.challenge': '12345abc',
      },
    });
    expect(res.statusCode).toBe(403);
  });

  it('ignora payloads sin mensajes (solo statuses)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/webhook/whatsapp',
      payload: {
        object: 'whatsapp_business_account',
        entry: [
          {
            id: 'waba_1',
            changes: [
              {
                field: 'messages',
                value: {
                  messaging_product: 'whatsapp',
                  metadata: { phone_number_id: '000000000000000' },
                  statuses: [{ id: 'wamid.status.1', status: 'delivered' }],
                },
              },
            ],
          },
        ],
      },
    });
    expect(res.statusCode).toBe(200);
    await vi.waitFor(() => expect(fakeSendCounter).toBe(0));
    expect(client.sendText).not.toHaveBeenCalled();
  });

  it('procesa un mensaje de texto de un número autorizado y responde', async () => {
    const msgId = `wamid.test.text.${Date.now()}`;
    const res = await app.inject({
      method: 'POST',
      url: '/webhook/whatsapp',
      payload: textPayload(ALLOWED_PHONE, 'pagar la expensa el viernes', msgId),
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'received' });

    await vi.waitFor(() => expect(client.sendText).toHaveBeenCalledTimes(1));

    const entry = client.sendText.mock.calls[0]?.[0];
    expect(entry?.to).toBe(ALLOWED_PHONE);
    expect(entry?.text).toContain('Recibido');

    await vi.waitFor(async () => {
      const inbound = await prisma.messageLog.findUnique({ where: { waMessageId: msgId } });
      expect(inbound?.direction).toBe('INBOUND');
    });
  });

  it('ignora mensajes de números no autorizados', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/webhook/whatsapp',
      payload: textPayload('5499999999999', 'hola', `wamid.test.noauth.${Date.now()}`),
    });

    expect(res.statusCode).toBe(200);
    await vi.waitFor(() => expect(fakeSendCounter).toBe(0));
    expect(client.sendText).not.toHaveBeenCalled();
  });

  it('rechaza POST con firma inválida cuando hay app secret', async () => {
    const prev = process.env.WA_APP_SECRET;
    process.env.WA_APP_SECRET = 'secret-test';
    try {
      const res = await app.inject({
        method: 'POST',
        url: '/webhook/whatsapp',
        headers: { 'x-hub-signature-256': 'sha256=firma-invalida' },
        payload: textPayload(ALLOWED_PHONE, 'hola', `wamid.test.sig.${Date.now()}`),
      });
      expect(res.statusCode).toBe(401);
    } finally {
      if (prev === undefined) delete process.env.WA_APP_SECRET;
      else process.env.WA_APP_SECRET = prev;
    }
  });
});

describe('extractMessages', () => {
  it('normaliza texto e imágenes', () => {
    const messages = extractMessages(
      textPayload('5491100000000', 'comprar leche', 'wamid.parse.1'),
    );
    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({
      waPhone: '5491100000000',
      type: 'text',
      text: 'comprar leche',
    });
  });
});
