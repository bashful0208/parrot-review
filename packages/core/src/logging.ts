import pino from 'pino';
import pinoPretty from 'pino-pretty';

export type LogLevel = 'info' | 'error' | 'warn' | 'debug';

export type LogContext = {
  requestId?: string;
  taskId?: string;
  organizationId?: string;
  repositoryId?: string;
  userId?: string;
  component?: 'web' | 'worker' | 'api' | 'queue';
  service?: 'reviewer-web' | 'reviewer-worker';
};

export interface Logger {
  info(message: string, data?: Record<string, unknown>): void;
  error(message: string, error?: Error | unknown, data?: Record<string, unknown>): void;
  warn(message: string, data?: Record<string, unknown>): void;
  debug(message: string, data?: Record<string, unknown>): void;
  child(context: Partial<LogContext>): Logger;
}

// 配置 pino
const isProduction = process.env.NODE_ENV === 'production';
const isDevelopment = process.env.NODE_ENV === 'development';

const pinoConfig: pino.LoggerOptions = {
  level: process.env.LOG_LEVEL || (isProduction ? 'info' : 'debug'),
  formatters: {
    level: (label: string) => ({ level: label }),
  },
  serializers: {
    error: pino.stdSerializers.err,
  },
  timestamp: pino.stdTimeFunctions.isoTime,
};

const baseTransport = isDevelopment
  ? pinoPretty({
      colorize: true,
      translateTime: 'SYS:standard',
      ignore: 'pid,hostname',
    })
  : undefined;

const baseLogger = pino(pinoConfig, baseTransport);

export function createLogger(context: LogContext = {}): Logger {
  const childLogger = baseLogger.child({
    request_id: context.requestId,
    task_id: context.taskId,
    organization_id: context.organizationId,
    repository_id: context.repositoryId,
    user_id: context.userId,
    component: context.component,
    service: context.service,
  });

  const loggerContext = { ...context };

  return {
    info(message: string, data?: Record<string, unknown>): void {
      childLogger.info({ ...data }, message);
    },

    error(message: string, error?: Error | unknown, data?: Record<string, unknown>): void {
      childLogger.error({ err: error, ...data }, message);
    },

    warn(message: string, data?: Record<string, unknown>): void {
      childLogger.warn({ ...data }, message);
    },

    debug(message: string, data?: Record<string, unknown>): void {
      childLogger.debug({ ...data }, message);
    },

    child(context: Partial<LogContext>): Logger {
      const mergedContext: LogContext = {
        ...loggerContext,
        ...context,
      };
      return createLogger(mergedContext);
    },
  };
}
