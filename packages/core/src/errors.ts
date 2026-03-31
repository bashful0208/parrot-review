export type ErrorCategory = "user" | "platform" | "model" | "rule" | "timeout" | "dependency";

export const ErrorCode = {
  // 用户配置错误
  UserConfig: "USER_CONFIG_ERROR",
  UserConfigMissingField: "USER_CONFIG_MISSING_FIELD",
  UserConfigInvalidValue: "USER_CONFIG_INVALID_VALUE",
  UserConfigValidationFailed: "USER_CONFIG_VALIDATION_FAILED",

  // 平台回调错误
  PlatformCallback: "PLATFORM_CALLBACK_ERROR",
  PlatformCallbackTimeout: "PLATFORM_CALLBACK_TIMEOUT",
  PlatformCallbackAuthFailed: "PLATFORM_CALLBACK_AUTH_FAILED",
  PlatformCallbackRateLimited: "PLATFORM_CALLBACK_RATE_LIMITED",
  PlatformCallbackInvalidSignature: "PLATFORM_CALLBACK_INVALID_SIGNATURE",

  // 模型调用错误
  ModelInvocation: "MODEL_INVOCATION_ERROR",
  ModelInvocationTimeout: "MODEL_INVOCATION_TIMEOUT",
  ModelInvocationRateLimit: "MODEL_INVOCATION_RATE_LIMIT",
  ModelInvocationInvalidResponse: "MODEL_INVOCATION_INVALID_RESPONSE",
  ModelInvocationQuotaExceeded: "MODEL_INVOCATION_QUOTA_EXCEEDED",
  ModelInvocationProviderUnavailable: "MODEL_INVOCATION_PROVIDER_UNAVAILABLE",

  // 规则解析错误
  RuleParse: "RULE_PARSE_ERROR",
  RuleParseSyntaxError: "RULE_PARSE_SYNTAX_ERROR",
  RuleParseInvalidSchema: "RULE_PARSE_INVALID_SCHEMA",
  RuleParseValidationFailed: "RULE_PARSE_VALIDATION_FAILED",
  RuleParseCircularReference: "RULE_PARSE_CIRCULAR_REFERENCE",

  // 任务超时错误
  TaskTimeout: "TASK_TIMEOUT_ERROR",
  TaskTimeoutExceeded: "TASK_TIMEOUT_EXCEEDED",
  TaskTimeoutNoHeartbeat: "TASK_TIMEOUT_NO_HEARTBEAT",
  TaskTimeoutResourceConstraint: "TASK_TIMEOUT_RESOURCE_CONSTRAINT",

  // 外部依赖错误
  DependencyRedisConnection: "DEPENDENCY_REDIS_CONNECTION_ERROR",
  DependencyDatabaseConnection: "DEPENDENCY_DATABASE_CONNECTION_ERROR",
  DependencyApiTimeout: "DEPENDENCY_API_TIMEOUT",
  DependencyApiRateLimit: "DEPENDENCY_API_RATE_LIMIT",
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

const ERROR_CATEGORY_BY_CODE: Record<ErrorCode, ErrorCategory> = {
  [ErrorCode.UserConfig]: "user",
  [ErrorCode.UserConfigMissingField]: "user",
  [ErrorCode.UserConfigInvalidValue]: "user",
  [ErrorCode.UserConfigValidationFailed]: "user",
  [ErrorCode.PlatformCallback]: "platform",
  [ErrorCode.PlatformCallbackTimeout]: "platform",
  [ErrorCode.PlatformCallbackAuthFailed]: "platform",
  [ErrorCode.PlatformCallbackRateLimited]: "platform",
  [ErrorCode.PlatformCallbackInvalidSignature]: "platform",
  [ErrorCode.ModelInvocation]: "model",
  [ErrorCode.ModelInvocationTimeout]: "model",
  [ErrorCode.ModelInvocationRateLimit]: "model",
  [ErrorCode.ModelInvocationInvalidResponse]: "model",
  [ErrorCode.ModelInvocationQuotaExceeded]: "model",
  [ErrorCode.ModelInvocationProviderUnavailable]: "model",
  [ErrorCode.RuleParse]: "rule",
  [ErrorCode.RuleParseSyntaxError]: "rule",
  [ErrorCode.RuleParseInvalidSchema]: "rule",
  [ErrorCode.RuleParseValidationFailed]: "rule",
  [ErrorCode.RuleParseCircularReference]: "rule",
  [ErrorCode.TaskTimeout]: "timeout",
  [ErrorCode.TaskTimeoutExceeded]: "timeout",
  [ErrorCode.TaskTimeoutNoHeartbeat]: "timeout",
  [ErrorCode.TaskTimeoutResourceConstraint]: "timeout",
  [ErrorCode.DependencyRedisConnection]: "dependency",
  [ErrorCode.DependencyDatabaseConnection]: "dependency",
  [ErrorCode.DependencyApiTimeout]: "dependency",
  [ErrorCode.DependencyApiRateLimit]: "dependency",
};

export interface ErrorContext {
  requestId?: string;
  taskId?: string;
  organizationId?: string;
  repositoryId?: string;
  userId?: string;
  operation?: string;
  retryCount?: number;
  timeoutMs?: number;
  resource?: string;
  provider?: string;
  [key: string]: unknown;
}

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly category: ErrorCategory;
  readonly context?: ErrorContext;

  constructor(
    code: ErrorCode,
    message: string,
    context?: ErrorContext,
    options?: ErrorOptions
  ) {
    super(message, options);
    this.name = "AppError";
    this.code = code;
    this.category = ERROR_CATEGORY_BY_CODE[code];
    this.context = context;
  }

  toJSON() {
    return {
      name: this.name,
      code: this.code,
      category: this.category,
      message: this.message,
      context: this.context,
      stack: this.stack,
    };
  }
}
