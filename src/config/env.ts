import { z } from 'zod';

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  HOST: z.string().default('0.0.0.0'),

  DATABASE_URL: z.string().url(),

  META_WA_TOKEN: z.string().min(1),
  WA_PHONE_NUMBER_ID: z.string().min(1),
  WA_WEBHOOK_VERIFY_TOKEN: z.string().min(1),
  // Versión de la Graph API (Meta la descontinúa vieja tras 2 años aprox.)
  WA_GRAPH_API_VERSION: z
    .string()
    .regex(/^v\d+(\.\d+)?$/, 'Formato vNN.N')
    .default('v25.0'),
  // App secret de Meta: si está presente, el webhook valida la firma X-Hub-Signature-256.
  WA_APP_SECRET: z.string().optional(),

  GEMINI_API_KEY: z.string().min(1),

  AGENDA_OWNERS_WHATSAPP: z
    .string()
    .transform((v) =>
      v
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    )
    .pipe(z.array(z.string().min(8)).max(2)),

  DAILY_REMINDER_TIME: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Formato HH:MM')
    .default('08:00'),
});

export type Env = z.infer<typeof EnvSchema>;

/**
 * Valida las variables de entorno con zod y devuelve la config tipada.
 * Falla temprano si falta algo crítico.
 */
export function loadEnv(env: NodeJS.ProcessEnv = process.env): Env {
  const parsed = EnvSchema.safeParse(env);
  if (!parsed.success) {
    const missing = parsed.error.issues
      .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Configuración de entorno inválida:\n${missing}`);
  }
  return parsed.data;
}
