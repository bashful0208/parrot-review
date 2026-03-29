export type ErrorCategory = "user" | "platform" | "model" | "rule" | "timeout";
export declare const ErrorCode: {
    readonly UserConfig: "USER_CONFIG_ERROR";
    readonly PlatformCallback: "PLATFORM_CALLBACK_ERROR";
    readonly ModelInvocation: "MODEL_INVOCATION_ERROR";
    readonly RuleParse: "RULE_PARSE_ERROR";
    readonly TaskTimeout: "TASK_TIMEOUT_ERROR";
};
export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];
export declare class AppError extends Error {
    readonly code: ErrorCode;
    readonly category: ErrorCategory;
    constructor(code: ErrorCode, message: string, options?: ErrorOptions);
}
