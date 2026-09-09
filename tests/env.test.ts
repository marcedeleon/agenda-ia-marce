import { describe, it, expect } from 'vitest';
import { loadEnv } from '../src/config/env.js';

describe('loadEnv', () => {
  const baseEnv = {
    DATABASE_URL: 'postgresql://agenda:agenda@localhost:5432/agenda_ia?schema=public',
    META_WA_TOKEN: 'token-test',
    WA_PHONE_NUMBER_ID: '123456789',
    WA_WEBHOOK_VERIFY_TOKEN: 'verify-test',
    GEMINI_API_KEY: 'gemini-test',
    AGENDA_OWNERS_WHATSAPP: '5491100000000,5491100000001',
  };

  it('parsea correctamente los números autorizados como lista', () => {
    const env = loadEnv({ ...baseEnv });
    expect(env.AGENDA_OWNERS_WHATSAPP).toEqual(['5491100000000', '5491100000001']);
    expect(env.NODE_ENV).toBe('development');
    expect(env.PORT).toBe(3000);
    expect(env.DAILY_REMINDER_TIME).toBe('08:00');
  });

  it('falla si falta una variable crítica', () => {
    const sinDb: Record<string, string> = { ...baseEnv };
    delete sinDb.DATABASE_URL;
    expect(() => loadEnv(sinDb)).toThrow(/Configuración de entorno inválida/);
  });

  it('falla si la hora del recordatorio no es HH:MM válido', () => {
    expect(() => loadEnv({ ...baseEnv, DAILY_REMINDER_TIME: '25:99' })).toThrow();
  });
});
