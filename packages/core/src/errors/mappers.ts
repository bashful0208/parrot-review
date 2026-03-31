import { AppError, ErrorCode, ErrorContext } from '../errors.js';

export function mapUserConfigError(
  field: string,
  reason: 'missing' | 'invalid' | 'validation_failed',
  context?: ErrorContext
): AppError {
  const codeMap = {
    missing: ErrorCode.UserConfigMissingField,
    invalid: ErrorCode.UserConfigInvalidValue,
    validation_failed: ErrorCode.UserConfigValidationFailed,
  };

  const message = `User config error: field '${field}' is ${reason}`;

  return new AppError(
    codeMap[reason],
    message,
    { ...context, operation: 'validate_user_config' }
  );
}

export function mapPlatformCallbackError(
  error: unknown,
  provider: string,
  context?: ErrorContext
): AppError {
  let code: ErrorCode = ErrorCode.PlatformCallback;
  let message = `Platform callback error from ${provider}`;

  if (error instanceof Error) {
    const lowerMessage = error.message.toLowerCase();
    if (lowerMessage.includes('timeout')) {
      code = ErrorCode.PlatformCallbackTimeout;
      message = `Platform callback timeout: ${provider}`;
    } else if (lowerMessage.includes('auth') || lowerMessage.includes('unauthorized')) {
      code = ErrorCode.PlatformCallbackAuthFailed;
      message = `Platform callback auth failed: ${provider}`;
    } else if (lowerMessage.includes('rate limit')) {
      code = ErrorCode.PlatformCallbackRateLimited;
      message = `Platform callback rate limited: ${provider}`;
    } else if (lowerMessage.includes('signature')) {
      code = ErrorCode.PlatformCallbackInvalidSignature;
      message = `Platform callback invalid signature: ${provider}`;
    }
  }

  return new AppError(
    code,
    message,
    { ...context, operation: 'platform_callback', provider }
  );
}

export function mapModelInvocationError(
  error: unknown,
  provider: string,
  context?: ErrorContext
): AppError {
  let code: ErrorCode = ErrorCode.ModelInvocation;
  let message = `Model invocation error from ${provider}`;

  if (error instanceof Error) {
    const lowerMessage = error.message.toLowerCase();
    const errorObj = error as unknown as Record<string, unknown>;
    if (lowerMessage.includes('timeout')) {
      code = ErrorCode.ModelInvocationTimeout;
      message = `Model invocation timeout: ${provider}`;
    } else if (lowerMessage.includes('rate limit') || errorObj.status === 429) {
      code = ErrorCode.ModelInvocationRateLimit;
      message = `Model invocation rate limited: ${provider}`;
    } else if (errorObj.status === 503) {
      code = ErrorCode.ModelInvocationProviderUnavailable;
      message = `Model provider unavailable: ${provider}`;
    } else if (lowerMessage.includes('quota')) {
      code = ErrorCode.ModelInvocationQuotaExceeded;
      message = `Model invocation quota exceeded: ${provider}`;
    }
  }

  return new AppError(
    code,
    message,
    { ...context, operation: 'model_invocation', provider }
  );
}

export function mapRuleParseError(
  error: unknown,
  ruleId: string,
  context?: ErrorContext
): AppError {
  let code: ErrorCode = ErrorCode.RuleParse;
  let message = `Rule parse error: ${ruleId}`;

  if (error instanceof Error) {
    const lowerMessage = error.message.toLowerCase();
    if (lowerMessage.includes('syntax')) {
      code = ErrorCode.RuleParseSyntaxError;
      message = `Rule syntax error: ${ruleId}`;
    } else if (lowerMessage.includes('schema')) {
      code = ErrorCode.RuleParseInvalidSchema;
      message = `Rule invalid schema: ${ruleId}`;
    } else if (lowerMessage.includes('validation')) {
      code = ErrorCode.RuleParseValidationFailed;
      message = `Rule validation failed: ${ruleId}`;
    } else if (lowerMessage.includes('circular')) {
      code = ErrorCode.RuleParseCircularReference;
      message = `Rule circular reference detected: ${ruleId}`;
    }
  }

  return new AppError(
    code,
    message,
    { ...context, operation: 'parse_rule' }
  );
}

export function mapTaskTimeoutError(
  taskId: string,
  reason: 'exceeded' | 'no_heartbeat' | 'resource_constraint',
  timeoutMs: number,
  context?: ErrorContext
): AppError {
  const codeMap = {
    exceeded: ErrorCode.TaskTimeoutExceeded,
    no_heartbeat: ErrorCode.TaskTimeoutNoHeartbeat,
    resource_constraint: ErrorCode.TaskTimeoutResourceConstraint,
  };

  const message = `Task timeout (${reason}): ${taskId} after ${timeoutMs}ms`;

  return new AppError(
    codeMap[reason],
    message,
    { ...context, operation: 'task_execution', task_id: taskId, timeout_ms: timeoutMs }
  );
}
