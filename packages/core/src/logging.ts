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

export type LogEntry = {
  level: LogLevel;
  message: string;
  request_id?: string;
  task_id?: string;
  organization_id?: string;
  repository_id?: string;
  user_id?: string;
  component?: string;
  service?: string;
  [key: string]: unknown;
};

export interface Logger {
  info(message: string, data?: Record<string, unknown>): LogEntry;
  error(message: string, error?: Error | unknown, data?: Record<string, unknown>): LogEntry;
  warn(message: string, data?: Record<string, unknown>): LogEntry;
  debug(message: string, data?: Record<string, unknown>): LogEntry;
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
  const contextFields = {
    request_id: context.requestId,
    task_id: context.taskId,
    organization_id: context.organizationId,
    repository_id: context.repositoryId,
    user_id: context.userId,
    component: context.component,
    service: context.service,
  };

  const childLogger = baseLogger.child(contextFields);
  const loggerContext = { ...context };

  function buildEntry(level: LogLevel, message: string, data?: Record<string, unknown>): LogEntry {
    const entry: LogEntry = { level, message };
    for (const [k, v] of Object.entries(contextFields)) {
      if (v !== undefined) entry[k] = v;
    }
    if (data) Object.assign(entry, data);
    return entry;
  }

  return {
    info(message: string, data?: Record<string, unknown>): LogEntry {
      childLogger.info({ ...data }, message);
      return buildEntry('info', message, data);
    },

    error(message: string, error?: Error | unknown, data?: Record<string, unknown>): LogEntry {
      const errorObj = error instanceof Error ? error : error ? new Error(String(error)) : undefined;
      childLogger.error({ err: errorObj, ...data }, message);
      return buildEntry('error', message, data);
    },

    warn(message: string, data?: Record<string, unknown>): LogEntry {
      childLogger.warn({ ...data }, message);
      return buildEntry('warn', message, data);
    },

    debug(message: string, data?: Record<string, unknown>): LogEntry {
      childLogger.debug({ ...data }, message);
      return buildEntry('debug', message, data);
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
