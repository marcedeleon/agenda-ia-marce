import { prisma } from '../../lib/prisma.js';
import {
  dayRangeInTz,
  formatLongDate,
  parseIsoDateOrNull,
  todayISO,
  addDaysISO,
  zonedToUtc,
} from '../../lib/date.js';
import { RecurrenceFreq } from '../../generated/prisma/client.js';
import type { Frequency, ParsedRecurrence } from '../gemini/types.js';

const FREQUENCY_TO_ENUM: Record<Frequency, RecurrenceFreq> = {
  diaria: RecurrenceFreq.DAILY,
  semanal: RecurrenceFreq.WEEKLY,
  mensual: RecurrenceFreq.MONTHLY,
};

export interface CreateTaskInput {
  title: string;
  description?: string | null;
  fecha?: string | null;
  hora?: string | null;
  recurrence?: ParsedRecurrence | null;
}

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

function parseTimeOrNull(value: string | null | undefined): string | null {
  if (!value) return null;
  return TIME_PATTERN.test(value) ? value : null;
}

/** Fecha+hora (zona de la agenda) → instante UTC, o null si la fecha es inválida. */
function buildDueDate(
  fecha: string | null | undefined,
  hora: string | null | undefined,
): Date | null {
  if (!fecha) return null;
  const date = parseIsoDateOrNull(fecha);
  if (!date) return null;
  const time = parseTimeOrNull(hora) ?? '00:00';
  return zonedToUtc(fecha, time);
}

/**
 * Asegura que exista el usuario y la agenda compartida única.
 * En el MVP hay una sola agenda para todos; la crea la primera vez que alguien escribe.
 */
export async function ensureAgendaFor(
  waPhone: string,
): Promise<{ agendaId: string; userId: string }> {
  const user = await prisma.user.upsert({
    where: { waPhone },
    update: {},
    create: { waPhone, name: waPhone },
  });

  let agenda = await prisma.agenda.findFirst();
  if (!agenda) {
    agenda = await prisma.agenda.create({
      data: {
        name: 'Agenda compartida',
        members: { create: [{ userId: user.id }] },
      },
    });
  } else {
    await prisma.agendaMember.upsert({
      where: { agendaId_userId: { agendaId: agenda.id, userId: user.id } },
      update: {},
      create: { agendaId: agenda.id, userId: user.id },
    });
  }

  return { agendaId: agenda.id, userId: user.id };
}

function recurrenceData(recurrence: ParsedRecurrence): {
  freq: RecurrenceFreq;
  interval: number;
  weekday: number | null;
  dayOfMonth: number | null;
  endsOn: Date | null;
} {
  return {
    freq: FREQUENCY_TO_ENUM[recurrence.frecuencia],
    interval: recurrence.intervalo,
    weekday: recurrence.dia_semana,
    dayOfMonth: recurrence.dia_mes,
    endsOn: parseIsoDateOrNull(recurrence.hasta),
  };
}

/** Crea la tarea (con su recurrencia, si hay) y la guarda. */
export async function createTask(
  agendaId: string,
  createdById: string,
  input: CreateTaskInput,
): Promise<{
  id: string;
  title: string;
  dueDate: Date | null;
  dueTime: string | null;
  recurrence: ParsedRecurrence | null;
}> {
  const recurrence = input.recurrence;
  const task = await prisma.task.create({
    data: {
      agendaId,
      createdById,
      title: input.title,
      description: input.description,
      dueDate: buildDueDate(input.fecha, input.hora),
      dueTime: parseTimeOrNull(input.hora),
      source: 'TEXT',
      recurrence:
        recurrence && recurrence.frecuencia ? { create: recurrenceData(recurrence) } : undefined,
    },
    include: { recurrence: true },
  });

  return {
    id: task.id,
    title: task.title,
    dueDate: task.dueDate,
    dueTime: task.dueTime,
    recurrence: task.recurrence
      ? {
          frecuencia: mapEnumToFrequency(task.recurrence.freq),
          intervalo: task.recurrence.interval,
          dia_semana: task.recurrence.weekday,
          dia_mes: task.recurrence.dayOfMonth,
          hasta: task.recurrence.endsOn?.toISOString().slice(0, 10) ?? null,
        }
      : null,
  };
}

function mapEnumToFrequency(freq: RecurrenceFreq): Frequency {
  if (freq === RecurrenceFreq.WEEKLY) return 'semanal';
  if (freq === RecurrenceFreq.MONTHLY) return 'mensual';
  return 'diaria';
}

export type QueryScope = 'today' | 'tomorrow' | 'week' | 'pending' | 'date';

export interface ResolvedScope {
  scope: QueryScope;
  date?: string;
}

/** Interpreta el token que vino de Gemini como un rango de la agenda. */
export function resolveQueryScope(reference: string | null): ResolvedScope {
  const value = reference?.trim().toLowerCase() ?? '';
  if (value === 'hoy' || value === 'today') return { scope: 'today' };
  if (value === 'manana' || value === 'mañana' || value === 'tomorrow')
    return { scope: 'tomorrow' };
  if (value === 'semana' || value === 'week') return { scope: 'week' };
  if (value && parseIsoDateOrNull(value)) return { scope: 'date', date: value };
  // "pendientes" o cualquier cosa inentendible → pendientes sin fecha.
  return { scope: 'pending' };
}

/** Devuelve el rango de fechas para un scope, siempre en la zona de la agenda. */
function scopeRange(scope: ResolvedScope): { start: Date; end: Date } | null {
  if (scope.scope === 'today') return dayRangeInTz(todayISO());
  if (scope.scope === 'tomorrow') return dayRangeInTz(addDaysISO(todayISO(), 1));
  if (scope.scope === 'week') {
    const start = dayRangeInTz(todayISO()).start;
    return { start, end: dayRangeInTz(addDaysISO(todayISO(), 6)).end };
  }
  if (scope.scope === 'date' && scope.date) return dayRangeInTz(scope.date);
  return null; // pending: sin rango
}

export interface AgendaTaskRow {
  title: string;
  dueDate: Date | null;
  dueTime: string | null;
  status: 'PENDING' | 'DONE' | 'CANCELLED';
}

/** Consulta las tareas de un día, semana o las pendientes sin fecha. */
export async function queryAgendaTasks(
  agendaId: string,
  scope: ResolvedScope,
): Promise<AgendaTaskRow[]> {
  const range = scopeRange(scope);

  if (scope.scope === 'pending') {
    const rows = await prisma.task.findMany({
      where: {
        agendaId,
        status: 'PENDING',
        dueDate: null,
      },
      orderBy: [{ dueTime: 'asc' }],
      select: { title: true, dueDate: true, dueTime: true, status: true },
    });
    return rows as AgendaTaskRow[];
  }

  if (!range) return [];

  const rows = await prisma.task.findMany({
    where: {
      agendaId,
      status: { not: 'CANCELLED' },
      dueDate: { gte: range.start, lt: range.end },
    },
    orderBy: [{ dueDate: 'asc' }, { dueTime: 'asc' }],
    select: { title: true, dueDate: true, dueTime: true, status: true },
  });
  return rows as AgendaTaskRow[];
}

/** Encabezado humano del listado ("Hoy tenés:..." / "El jueves 12 de septiembre tenés:..."). */
export function queryHeader(scope: ResolvedScope): string {
  if (scope.scope === 'today') return 'Hoy tenés:';
  if (scope.scope === 'tomorrow') return 'Mañana tenés:';
  if (scope.scope === 'week') return 'Esta semana tenés:';
  if (scope.scope === 'pending') return 'Sin fecha, te quedó pendiente:';
  if (scope.scope === 'date' && scope.date) return `El ${formatLongDate(scope.date)} tenés:`;
  return 'Te quedó pendiente:';
}
