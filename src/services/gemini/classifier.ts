import { GoogleGenAI } from '@google/genai';
import { logger } from '../../lib/logger.js';
import { ClassifiedSchema, type ParsedClassification } from './types.js';

/** Clasificación ya validada y lista para usar en el handler. */
export interface ClassifiedMessage {
  intent: ParsedClassification['intent'];
  task: NonNullable<ParsedClassification['tarea']> | null;
  queryReference: string | null;
}

/**
 * Clasificador de mensajes: recibe el texto del usuario y la fecha de hoy en la
 * zona de la agenda, y devuelve la intención + datos estructurados.
 */
export type Classifier = (input: { text: string; todayISO: string }) => Promise<ClassifiedMessage>;

/** Schema Vertex-AI (tipo `Schema` del SDK) para forzar JSON estructurado. */
const OUTPUT_SCHEMA = {
  type: 'OBJECT',
  properties: {
    intent: {
      type: 'STRING',
      enum: ['crear_tarea', 'consultar_agenda', 'otros'],
    },
    consulta_fecha: {
      type: 'STRING',
      nullable: true,
      description: 'hoy, manana, semana, pendientes o YYYY-MM-DD',
    },
    tarea: {
      type: 'OBJECT',
      nullable: true,
      properties: {
        titulo: {
          type: 'STRING',
          description: 'Título corto y accionable de la tarea',
        },
        descripcion: {
          type: 'STRING',
          nullable: true,
        },
        fecha: {
          type: 'STRING',
          nullable: true,
          description: 'YYYY-MM-DD o null',
        },
        hora: {
          type: 'STRING',
          nullable: true,
          description: 'HH:MM formato 24h o null',
        },
        recurrencia: {
          type: 'OBJECT',
          nullable: true,
          properties: {
            frecuencia: {
              type: 'STRING',
              enum: ['diaria', 'semanal', 'mensual'],
            },
            intervalo: {
              type: 'INTEGER',
              nullable: true,
              description: 'Cada cuántas unidades se repite (1 = siempre)',
            },
            dia_semana: {
              type: 'INTEGER',
              nullable: true,
              description: '0=Lunes ... 6=Domingo (solo para semanal)',
            },
            dia_mes: {
              type: 'INTEGER',
              nullable: true,
              description: 'Día del mes 1..31 (solo para mensual)',
            },
            hasta: {
              type: 'STRING',
              nullable: true,
              description: 'YYYY-MM-DD o null',
            },
          },
          required: ['frecuencia'],
        },
      },
      required: ['titulo'],
    },
  },
  required: ['intent'],
} as const;

function buildSystemPrompt(todayISO: string): string {
  return [
    'Sos el cerebro de una agenda compartida de dos personas que se escriben por WhatsApp.',
    'El usuario te manda por texto el contenido de tareas o preguntas sobre la agenda.',
    `Hoy es ${todayISO}. Resolvé toda fecha relativa ("hoy", "mañana", "en 3 días", "el próximo lunes", "el 15 de octubre") contra esa fecha de hoy, en formato YYYY-MM-DD.`,
    '',
    'Clasificá la intención:',
    '- crear_tarea: el mensaje describe una tarea, pendiente, compra, trámite o recordatorio a agendar. ' +
      'Completá "tarea" con título corto; fecha (YYYY-MM-DD o null si no tiene); hora (HH:MM 24h o null); ' +
      'recurrencia si se repite ("todos los lunes", "cada 2 días", "todos los 15", "cada mes").',
    '- consultar_agenda: el mensaje pregunta qué hay que hacer. `consulta_fecha` = "hoy", "manana", "semana", "pendientes" o una fecha YYYY-MM-DD absoluta.',
    '- otros: saludos, chistes o mensajes que no son tareas ni consultas a la agenda.',
    '',
    'Respondé SOLO el objeto JSON con el schema pedido, sin texto extra.',
  ].join('\n');
}

function stripAccents(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

/**
 * Normaliza valores sueltos que suelen venir con variantes del modelo
 * (mayúsculas, acentos, espacios) antes de validar con zod.
 */
function tidy(value: unknown): unknown {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(tidy);

  const out: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
    if (typeof val !== 'string') {
      out[key] = tidy(val);
      continue;
    }
    if (key === 'intent' || key === 'frecuencia') out[key] = val.toLowerCase();
    else if (key === 'consulta_fecha') out[key] = stripAccents(val.toLowerCase()).trim();
    else if (key === 'fecha' || key === 'hasta') out[key] = val.trim();
    else if (key === 'hora') {
      const m = val.trim().match(/^(\d{1,2}):(\d{1,2})$/);
      out[key] = m
        ? `${(m[1] ?? '').padStart(2, '0')}:${(m[2] ?? '').padStart(2, '0')}`
        : val.trim();
    } else {
      out[key] = val;
    }
  }
  return out;
}

function toClassifiedMessage(parsed: ParsedClassification): ClassifiedMessage {
  return {
    intent: parsed.intent,
    task: parsed.tarea,
    queryReference: parsed.consulta_fecha ?? null,
  };
}

/** Parsea y valida la respuesta cruda de Gemini; nunca lanza. */
export function parseClassification(raw: string): ClassifiedMessage {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch (err) {
    logger.warn({ err, raw }, 'Gemini devolvió JSON inválido');
    return { intent: 'otros', task: null, queryReference: null };
  }

  const parsed = ClassifiedSchema.safeParse(tidy(json));
  if (!parsed.success) {
    logger.warn({ issues: parsed.error.issues }, 'Clasificación fuera de schema');
    return { intent: 'otros', task: null, queryReference: null };
  }
  return toClassifiedMessage(parsed.data);
}

function truncate(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max - 1)}…`;
}

/**
 * Clasificador real que llama a Gemini (Google GenAI SDK).
 * Se construye una vez con la API key y el modelo.
 */
export function createGeminiClassifier(apiKey: string, model: string): Classifier {
  const ai = new GoogleGenAI({ apiKey });

  return async ({ text, todayISO }) => {
    const response = await ai.models.generateContent({
      model,
      contents: [{ role: 'user', parts: [{ text: truncate(text, 1500) }] }],
      config: {
        temperature: 0,
        responseMimeType: 'application/json',
        responseSchema: OUTPUT_SCHEMA,
        systemInstruction: { parts: [{ text: buildSystemPrompt(todayISO) }] },
      },
    });
    return parseClassification(response.text ?? '');
  };
}
