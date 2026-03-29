export type ErrorCategory = "user" | "platform" | "model" | "rule" | "timeout";

export const ErrorCode = {
  UserConfig: "USER_CONFIG_ERROR",
  PlatformCallback: "PLATFORM_CALLBACK_ERROR",
  ModelInvocation: "MODEL_INVOCATION_ERROR",
  RuleParse: "RULE_PARSE_ERROR",
  TaskTimeout: "TASK_TIMEOUT_ERROR",
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

const ERROR_CATEGORY_BY_CODE: Record<ErrorCode, ErrorCategory> = {
  [ErrorCode.UserConfig]: "user",
  [ErrorCode.PlatformCallback]: "platform",
  [ErrorCode.ModelInvocation]: "model",
  [ErrorCode.RuleParse]: "rule",
  [ErrorCode.TaskTimeout]: "timeout",
};

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly category: ErrorCategory;

  constructor(code: ErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "AppError";
    this.code = code;
    this.category = ERROR_CATEGORY_BY_CODE[code];
  }
}
