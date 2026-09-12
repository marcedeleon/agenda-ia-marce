import { type LoggerOptions, pino } from 'pino';

export const loggerConfig: LoggerOptions = {
  level: process.env.LOG_LEVEL ?? 'info',
  ...(process.env.NODE_ENV === 'development' && { transport: { target: 'pino-pretty' } }),
};

export const logger = pino(loggerConfig);
