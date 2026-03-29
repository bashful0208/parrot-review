export const ErrorCode = {
    UserConfig: "USER_CONFIG_ERROR",
    PlatformCallback: "PLATFORM_CALLBACK_ERROR",
    ModelInvocation: "MODEL_INVOCATION_ERROR",
    RuleParse: "RULE_PARSE_ERROR",
    TaskTimeout: "TASK_TIMEOUT_ERROR",
};
const ERROR_CATEGORY_BY_CODE = {
    [ErrorCode.UserConfig]: "user",
    [ErrorCode.PlatformCallback]: "platform",
    [ErrorCode.ModelInvocation]: "model",
    [ErrorCode.RuleParse]: "rule",
    [ErrorCode.TaskTimeout]: "timeout",
};
export class AppError extends Error {
    code;
    category;
    constructor(code, message, options) {
        super(message, options);
        this.name = "AppError";
        this.code = code;
        this.category = ERROR_CATEGORY_BY_CODE[code];
    }
}
