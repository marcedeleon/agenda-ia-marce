import { z } from 'zod';

/**
 * Esquema del JSON que devuelve Gemini al clasificar un mensaje.
 * Los enums y tokens llegan en minúsculas (se normalizan antes de parsear).
 */

export const FrequencySchema = z.enum(['diaria', 'semanal', 'mensual']);

export const RecurrenceSchema = z
  .object({
    frecuencia: FrequencySchema,
    intervalo: z.coerce.number().int().min(1).max(30).default(1),
    dia_semana: z.coerce.number().int().min(0).max(6).nullable().default(null),
    dia_mes: z.coerce.number().int().min(1).max(31).nullable().default(null),
    hasta: z.string().nullable().default(null),
  })
  .nullable()
  .default(null);

export const TaskDataSchema = z
  .object({
    titulo: z.string().min(1).max(200),
    descripcion: z.string().max(2000).nullable().default(null),
    fecha: z.string().nullish(), // YYYY-MM-DD (se valida contra el calendario real)
    hora: z.string().nullish(), // HH:MM 24h
    recurrencia: RecurrenceSchema,
  })
  .nullable()
  .default(null);

export const IntentSchema = z.enum(['crear_tarea', 'consultar_agenda', 'otros']);

export const ClassifiedSchema = z.object({
  intent: IntentSchema,
  tarea: TaskDataSchema,
  consulta_fecha: z.string().nullish(), // hoy | manana | semana | pendientes | YYYY-MM-DD
});

export type ParsedRecurrence = NonNullable<z.infer<typeof RecurrenceSchema>>;
export type ParsedTask = NonNullable<z.infer<typeof TaskDataSchema>>;
export type ParsedClassification = z.infer<typeof ClassifiedSchema>;

export type Intent = z.infer<typeof IntentSchema>;
export type Frequency = z.infer<typeof FrequencySchema>;
