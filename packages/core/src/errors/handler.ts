import { AppError, ErrorCode } from '../errors.ts';
import type { ErrorCategory } from '../errors.ts';
import type { Logger } from '../logging.ts';

export type ErrorSeverity = 'critical' | 'important' | 'general';

export function classifyError(error: AppError): ErrorSeverity {
  if (error.code === ErrorCode.DependencyRedisConnection ||
      error.code === ErrorCode.DependencyDatabaseConnection) {
    return 'critical';
  }

  if (error.code === ErrorCode.PlatformCallbackAuthFailed) {
    return 'critical';
  }

  if (error.category === 'timeout' ||
      error.code === ErrorCode.ModelInvocationRateLimit ||
      error.code === ErrorCode.PlatformCallbackRateLimited) {
    return 'important';
  }

  return 'general';
}

export function handleCriticalError(error: AppError | unknown, logger?: Logger): void {
  const appError = error instanceof AppError ? error : new AppError(
    ErrorCode.DependencyDatabaseConnection,
    error instanceof Error ? error.message : 'Unknown critical error'
  );

  logger?.error(
    '[CRITICAL] Critical error occurred',
    appError,
    { severity: 'critical' }
  );

  if (process.env.NODE_ENV !== 'test') {
    console.error('[CRITICAL] Application cannot continue:', appError);
    process.exit(1);
  }
}

export function handleImportantError(error: AppError | unknown, logger?: Logger): void {
  const appError = error instanceof AppError ? error : new AppError(
    ErrorCode.ModelInvocation,
    error instanceof Error ? error.message : 'Unknown important error'
  );

  logger?.error(
    '[IMPORTANT] Important error occurred',
    appError,
    { severity: 'important' }
  );
}

export function handleGeneralError(error: AppError | unknown, logger?: Logger): void {
  const appError = error instanceof AppError ? error : new AppError(
    ErrorCode.RuleParse,
    error instanceof Error ? error.message : 'Unknown general error'
  );

  logger?.warn(
    '[GENERAL] General error occurred',
    { severity: 'general', error: appError }
  );
}

export function ensureErrorLogged(
  error: AppError | unknown,
  logger?: Logger,
  context?: Record<string, unknown>
): void {
  if (error instanceof AppError) {
    const severity = classifyError(error);

    switch (severity) {
      case 'critical':
        handleCriticalError(error, logger);
        break;
      case 'important':
        handleImportantError(error, logger);
        break;
      case 'general':
        handleGeneralError(error, logger);
        break;
    }
  } else {
    logger?.error(
      '[UNHANDLED] Unhandled error',
      error,
      context
    );
  }
}

export function withErrorLogging<T>(
  operation: () => Promise<T>,
  logger?: Logger,
  context?: Record<string, unknown>
): Promise<T> {
  return operation().catch(error => {
    ensureErrorLogged(error, logger, context);
    throw error;
  });
}
