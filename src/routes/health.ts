import type { FastifyInstance } from 'fastify';
import { loadEnv } from '../config/env.js';
import { prisma } from '../lib/prisma.js';

export async function healthRoutes(app: FastifyInstance): Promise<void> {
  app.get('/health', async () => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      return { status: 'ok', db: 'up' };
    } catch (err) {
      app.log.error(err, 'Health check: DB no responde');
      return { status: 'degraded', db: 'down' };
    }
  });

  app.get('/status', async () => {
    const env = loadEnv();
    return {
      env: env.NODE_ENV,
      timezone: process.env.TZ ?? 'UTC',
      dailyReminderAt: env.DAILY_REMINDER_TIME,
      agendaOwners: env.AGENDA_OWNERS_WHATSAPP.length,
    };
  });
}
