import { AppError, ErrorCode, ErrorContext } from '../errors.js';
import { Logger } from '../logging.js';

export interface RetryConfig {
  maxRetries: number;
  initialDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
  jitterMs: number;
}

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  initialDelayMs: 1000,
  maxDelayMs: 30000,
  backoffMultiplier: 2,
  jitterMs: 500,
};

export async function withRetry<T>(
  operation: () => Promise<T>,
  config: RetryConfig = DEFAULT_RETRY_CONFIG,
  logger?: Logger
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;

      if (attempt === config.maxRetries) {
        throw error;
      }

      const delay = Math.min(
        config.initialDelayMs * Math.pow(config.backoffMultiplier, attempt) +
          Math.random() * config.jitterMs,
        config.maxDelayMs
      );

      logger?.warn(
        `Operation failed, retrying (attempt ${attempt + 1}/${config.maxRetries + 1}) after ${Math.round(delay)}ms`,
        { error: error instanceof Error ? error.message : String(error) }
      );

      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}

export async function withRedisErrorBoundary<T>(
  operation: () => Promise<T>,
  logger?: Logger,
  context?: ErrorContext
): Promise<T> {
  return withRetry(
    async () => {
      try {
        return await operation();
      } catch (error) {
        if (error instanceof Error) {
          const lowerMessage = error.message.toLowerCase();
          if (
            lowerMessage.includes('econnrefused') ||
            lowerMessage.includes('etimedout') ||
            lowerMessage.includes('connection refused') ||
            lowerMessage.includes('connection timeout')
          ) {
            const appError = new AppError(
              ErrorCode.DependencyRedisConnection,
              'Redis connection failed',
              { ...context, resource: 'redis', operation: context?.operation || 'redis_operation' }
            );
            logger?.error('Redis connection error', appError);
            throw appError;
          }
        }
        throw error;
      }
    },
    DEFAULT_RETRY_CONFIG,
    logger
  );
}

export async function withDatabaseErrorBoundary<T>(
  operation: () => Promise<T>,
  logger?: Logger,
  context?: ErrorContext
): Promise<T> {
  return withRetry(
    async () => {
      try {
        return await operation();
      } catch (error) {
        if (error instanceof Error) {
          if (error.message.includes('connection') || error.message.includes('timeout')) {
            const appError = new AppError(
              ErrorCode.DependencyDatabaseConnection,
              'Database connection failed',
              { ...context, resource: 'database', operation: context?.operation || 'database_operation' }
            );
            logger?.error('Database connection error', appError);
            throw appError;
          }
        }
        throw error;
      }
    },
    DEFAULT_RETRY_CONFIG,
    logger
  );
}

export async function withExternalApiErrorBoundary<T>(
  operation: () => Promise<T>,
  provider: string,
  logger?: Logger,
  context?: ErrorContext
): Promise<T> {
  return withRetry(
    async () => {
      try {
        return await operation();
      } catch (error: any) {
        if (error?.status === 429) {
          const appError = new AppError(
            ErrorCode.DependencyApiRateLimit,
            `External API rate limit: ${provider}`,
            { ...context, resource: 'api', provider }
          );
          logger?.error('API rate limit error', appError);
          throw appError;
        } else if (error?.status >= 500) {
          const appError = new AppError(
            ErrorCode.DependencyApiTimeout,
            `External API error: ${provider} (${error?.status})`,
            { ...context, resource: 'api', provider }
          );
          logger?.error('API server error', appError);
          throw appError;
        }
        throw error;
      }
    },
    DEFAULT_RETRY_CONFIG,
    logger
  );
}
