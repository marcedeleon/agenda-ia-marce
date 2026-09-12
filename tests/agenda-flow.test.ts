import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import { addDaysISO, todayISO } from '../src/lib/date.js';
import type { Classifier, ClassifiedMessage } from '../src/services/gemini/classifier.js';
import { ensureAgendaFor, createTask } from '../src/services/agenda/repository.js';
import type { WhatsAppWebhookPayload } from '../src/services/whatsapp/types.js';

const PHONE = process.env.AGENDA_OWNERS_WHATSAPP?.split(',')[0] ?? '5491100000000';
let sendCounter = 0;

class FakeWhatsAppClient {
  sendText = vi.fn(async (_: { phoneNumberId: string; to: string; text: string }) => ({
    waMessageId: `wamid.fake.flow.${++sendCounter}`,
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

describe('Flujo de agenda con clasificador', () => {
  let app: FastifyInstance;
  let client: FakeWhatsAppClient;
  let classify: Classifier;

  beforeAll(async () => {
    client = new FakeWhatsAppClient();
    classify = vi.fn(async (): Promise<ClassifiedMessage> => ({
      intent: 'otros',
      task: null,
      queryReference: null,
    })) as Classifier;
    app = buildApp({ loggerEnabled: false, whatsappClient: client, geminiClassifier: classify });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    await prisma.task.deleteMany({ where: { title: { startsWith: 'flujo_' } } });
    await prisma.messageLog.deleteMany({ where: { waPhone: PHONE } });
    await prisma.agenda.deleteMany();
    await prisma.user.deleteMany();
  });

  beforeEach(() => {
    sendCounter = 0;
    client.sendText.mockClear();
    (classify as ReturnType<typeof vi.fn>).mockReset();
  });

  afterEach(async () => {
    await prisma.task.deleteMany({ where: { title: { startsWith: 'flujo_' } } });
    await prisma.messageLog.deleteMany({ where: { waPhone: PHONE } });
  });

  const post = (body: string) =>
    app.inject({
      method: 'POST',
      url: '/webhook/whatsapp',
      payload: textPayload(PHONE, body, `wamid.flow.${Date.now()}.${Math.random()}`),
    });

  const setClassification = (value: ClassifiedMessage) =>
    (classify as ReturnType<typeof vi.fn>).mockResolvedValue(value);

  it('crea una tarea con fecha y hora a partir del mensaje', async () => {
    setClassification({
      intent: 'crear_tarea',
      task: {
        titulo: 'flujo_compras',
        descripcion: 'leche y pan',
        fecha: todayISO(),
        hora: '09:30',
        recurrencia: null,
      },
      queryReference: null,
    });

    const res = await post('comprar leche y pan a las 9:30');
    expect(res.statusCode).toBe(200);

    await vi.waitFor(() => expect(client.sendText).toHaveBeenCalledTimes(1));
    const entry = client.sendText.mock.calls[0]?.[0];
    expect(entry?.text).toContain('Listo, quedó anotado');
    expect(entry?.text).toContain('flujo_compras');
    expect(entry?.text).toContain('09:30 h');

    const task = await prisma.task.findFirst({ where: { title: 'flujo_compras' } });
    expect(task).not.toBeNull();
    expect(task?.dueDate).not.toBeNull();
    expect(task?.description).toBe('leche y pan');
  });

  it('contesta qué hay hoy con las tareas del día', async () => {
    const { agendaId, userId } = await ensureAgendaFor(PHONE);
    await createTask(agendaId, userId, {
      title: 'flujo_hoy',
      fecha: todayISO(),
      hora: '09:00',
    });
    await createTask(agendaId, userId, {
      title: 'flujo_manana',
      fecha: addDaysISO(todayISO(), 1),
      hora: '10:30',
    });

    setClassification({
      intent: 'consultar_agenda',
      task: null,
      queryReference: 'hoy',
    });

    await post('¿qué hay hoy?');
    await vi.waitFor(() => expect(client.sendText).toHaveBeenCalledTimes(1));
    const reply = client.sendText.mock.calls[0]?.[0]?.text ?? '';

    expect(reply).toContain('Hoy tenés:');
    expect(reply).toContain('flujo_hoy');
    expect(reply).toContain('09:00');
    expect(reply).not.toContain('flujo_manana');
  });

  it('anota una tarea recurrente semanal', async () => {
    setClassification({
      intent: 'crear_tarea',
      task: {
        titulo: 'flujo_recurrente',
        descripcion: null,
        fecha: null,
        hora: null,
        recurrencia: {
          frecuencia: 'semanal',
          intervalo: 1,
          dia_semana: 4,
          dia_mes: null,
          hasta: null,
        },
      },
      queryReference: null,
    });

    await post('jugar al fútbol todos los viernes');
    await vi.waitFor(() => expect(client.sendText).toHaveBeenCalledTimes(1));
    const reply = client.sendText.mock.calls[0]?.[0]?.text ?? '';

    expect(reply).toContain('Se repite: todos los viernes');

    const task = await prisma.task.findFirst({
      where: { title: 'flujo_recurrente' },
      include: { recurrence: true },
    });
    expect(task?.recurrence?.freq).toBe('WEEKLY');
    expect(task?.recurrence?.weekday).toBe(4);
  });

  it('lista las pendientes sin fecha', async () => {
    const { agendaId, userId } = await ensureAgendaFor(PHONE);
    await createTask(agendaId, userId, { title: 'flujo_pendiente', hora: '20:00' });

    setClassification({
      intent: 'consultar_agenda',
      task: null,
      queryReference: 'pendientes',
    });

    await post('¿qué quedó pendiente?');
    await vi.waitFor(() => expect(client.sendText).toHaveBeenCalledTimes(1));
    const reply = client.sendText.mock.calls[0]?.[0]?.text ?? '';

    expect(reply).toContain('Sin fecha, te quedó pendiente:');
    expect(reply).toContain('flujo_pendiente');
    expect(reply).toContain('20:00');
  });
});
