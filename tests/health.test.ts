import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';

describe('Rutas de health', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = buildApp({ loggerEnabled: false });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /health responde ok con la base disponible', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ status: 'ok', db: 'up' });
  });

  it('GET /status expone la configuración de la agenda', async () => {
    const res = await app.inject({ method: 'GET', url: '/status' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toHaveProperty('env');
    expect(body).toHaveProperty('timezone');
    expect(body).toHaveProperty('dailyReminderAt');
    expect(body.agendaOwners).toBeGreaterThan(0);
  });
});
