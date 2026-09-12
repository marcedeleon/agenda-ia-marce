import { describe, it, expect } from 'vitest';
import {
  addDaysISO,
  dayRangeInTz,
  formatLongDate,
  parseIsoDateOrNull,
  todayISO,
  zonedToUtc,
} from '../src/lib/date.js';

describe('helpers de fecha (zona America/Argentina/Buenos_Aires)', () => {
  it('convierte hora local a instante UTC correcto', () => {
    // 08:00 del 12 sep (UTC-3, sin DST) → 11:00 UTC
    const dt = zonedToUtc('2026-09-12', '08:00');
    expect(dt.toISOString()).toBe('2026-09-12T11:00:00.000Z');
  });

  it('el rango de un día dura exactamente 24 horas', () => {
    const { start, end } = dayRangeInTz('2026-09-12');
    expect(end.getTime() - start.getTime()).toBe(24 * 60 * 60 * 1000);
  });

  it('addDaysISO cruza cambio de mes', () => {
    expect(addDaysISO('2026-09-30', 2)).toBe('2026-10-02');
  });

  it('parseIsoDateOrNull rechaza fechas inexistentes', () => {
    expect(parseIsoDateOrNull('2026-02-31')).toBeNull();
    expect(parseIsoDateOrNull('31-12-2026')).toBeNull();
    expect(parseIsoDateOrNull('2026-09-12')?.toISOString()).toBe('2026-09-12T00:00:00.000Z');
  });

  it('todayISO devuelve una fecha YYYY-MM-DD válida', () => {
    expect(todayISO()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('formatLongDate arma una etiqueta legible', () => {
    expect(formatLongDate('2026-09-12')).toMatch(/12 de septiembre/);
  });
});
