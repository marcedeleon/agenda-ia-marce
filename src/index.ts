import 'dotenv/config';
import { loadEnv } from './config/env.js';
import { buildApp } from './app.js';

const env = loadEnv();

const app = buildApp();

const shutdown = async (signal: string): Promise<void> => {
  app.log.info({ signal }, 'Apagando servidor...');
  await app.close();
  process.exit(0);
};

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));

try {
  await app.listen({ port: env.PORT, host: env.HOST });
  app.log.info({ port: env.PORT, host: env.HOST, env: env.NODE_ENV }, 'Agenda IA Marce corriendo');
} catch (err) {
  app.log.error(err, 'No se pudo iniciar el servidor');
  process.exit(1);
}
