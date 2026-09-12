import { formatLongDateFromDate } from '../../lib/date.js';
import type { ParsedRecurrence } from '../gemini/types.js';
import type { AgendaTaskRow } from './repository.js';

const WEEKDAYS = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];

export interface CreatedTaskReply {
  title: string;
  dueDate: Date | null;
  dueTime: string | null;
  recurrence: ParsedRecurrence | null;
}

function recurrenceLabel(rec: ParsedRecurrence): string {
  const interval = rec.intervalo;
  switch (rec.frecuencia) {
    case 'diaria':
      return interval > 1 ? `cada ${interval} días` : 'todos los días';
    case 'semanal':
      return rec.dia_semana !== null
        ? `todos los ${WEEKDAYS[rec.dia_semana]}`
        : interval > 1
          ? `cada ${interval} semanas`
          : 'todas las semanas';
    case 'mensual':
      return rec.dia_mes !== null
        ? `todos los ${rec.dia_mes} de cada mes`
        : interval > 1
          ? `cada ${interval} meses`
          : 'todos los meses';
  }
}

/** Confirmación de que quedó guardada la tarea. */
export function formatTaskConfirmation(created: CreatedTaskReply): string {
  const details: string[] = [];
  if (created.dueDate) details.push(formatLongDateFromDate(created.dueDate));
  if (created.dueTime) details.push(`${created.dueTime} h`);

  let reply = `Listo, quedó anotado:\n\n• ${created.title}`;
  if (details.length > 0) reply += ` (${details.join(' · ')})`;
  if (created.recurrence) reply += `\nSe repite: ${recurrenceLabel(created.recurrence)}`;

  return `${reply}\n\nPasame cualquier cambio y lo ajusto.`;
}

/** Listado de tareas de una consulta ("¿qué hay hoy?"). */
export function formatTaskList(header: string, tasks: AgendaTaskRow[]): string {
  if (tasks.length === 0) {
    return `${header}\nSin tareas anotadas.`;
  }

  const lines = tasks.map((task) => {
    const time = task.dueTime ? `${task.dueTime} — ` : '';
    const done = task.status === 'DONE' ? ' [hecha]' : '';
    return `• ${time}${task.title}${done}`;
  });

  return `${header}\n\n${lines.join('\n')}`;
}
