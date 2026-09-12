/** Helpers de fecha para la agenda (zona horaria: America/Argentina/Buenos_Aires). */

export const AGENDA_TIME_ZONE = 'America/Argentina/Buenos_Aires';

const isoFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: AGENDA_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const LONG_DATE_FORMATTER = new Intl.DateTimeFormat('es-AR', {
  timeZone: AGENDA_TIME_ZONE,
  weekday: 'long',
  day: 'numeric',
  month: 'long',
});

/** Fecha de hoy en la zona de la agenda, como YYYY-MM-DD. */
export function todayISO(): string {
  const parts = isoFormatter.formatToParts(new Date());
  const read = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return `${read('year')}-${read('month')}-${read('day')}`;
}

function dateParts(isoDate: string): [number, number, number] {
  const [y, m, d] = isoDate.split('-').map(Number);
  if (y === undefined || m === undefined || d === undefined) {
    throw new TypeError(`Fecha inválida: ${isoDate}`);
  }
  return [y, m, d];
}

/** Suma `days` días a una fecha YYYY-MM-DD y devuelve otra YYYY-MM-DD. */
export function addDaysISO(isoDate: string, days: number): string {
  const [y, m, d] = dateParts(isoDate);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

/**
 * Convierte "YYYY-MM-DD HH:MM" en la zona de la agenda a un Date (instante UTC real),
 * respetando el desfasaje horario del día puntual.
 */
export function zonedToUtc(isoDate: string, time = '00:00'): Date {
  const [y, m, d] = dateParts(isoDate);
  const [hh, mm] = (time || '00:00').split(':').map(Number);
  const asUtc = new Date(Date.UTC(y, m - 1, d, hh, mm));

  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: AGENDA_TIME_ZONE,
    hourCycle: 'h23',
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(asUtc);
  const read = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  const wall = Date.UTC(
    read('year'),
    read('month') - 1,
    read('day'),
    read('hour'),
    read('minute'),
    read('second'),
  );

  return new Date(asUtc.getTime() - (wall - asUtc.getTime()));
}

/** Rango [inicio, fin) del día en la zona de la agenda, como Dates UTC. */
export function dayRangeInTz(isoDate: string): { start: Date; end: Date } {
  return { start: zonedToUtc(isoDate), end: zonedToUtc(addDaysISO(isoDate, 1)) };
}

/** Parsea YYYY-MM-DD validando día real; null si no es válida. */
export function parseIsoDateOrNull(value: string | null | undefined): Date | null {
  if (!value) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]) - 1;
  const d = Number(m[3]);
  const dt = new Date(Date.UTC(y, mo, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo || dt.getUTCDate() !== d) {
    return null;
  }
  return dt;
}

/** Jueves 12 de septiembre — etiqueta legible de una fecha en la zona de la agenda. */
export function formatLongDate(isoDate: string): string {
  return LONG_DATE_FORMATTER.format(zonedToUtc(isoDate));
}

/** Igual que formatLongDate, pero recibe un Date UTC ya resuelto. */
export function formatLongDateFromDate(date: Date): string {
  return LONG_DATE_FORMATTER.format(date);
}
