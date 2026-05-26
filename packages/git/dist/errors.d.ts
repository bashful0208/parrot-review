import { AppError, type ErrorContext, type Logger } from "@reviewer/core";
export declare class GitPlatformApiError extends AppError {
    readonly providerStatusCode: number | undefined;
    constructor(provider: string, message: string, context?: ErrorContext, statusCode?: number);
}
export declare class GitPlatformRateLimitError extends AppError {
    readonly retryAfterMs: number | undefined;
    constructor(provider: string, message: string, context?: ErrorContext, retryAfterMs?: number);
}
export declare class GitPlatformAuthError extends AppError {
    constructor(provider: string, message: string, context?: ErrorContext);
}
export declare class GitWebhookSignatureError extends AppError {
    constructor(provider: string, context?: ErrorContext);
}
export declare class GitProviderNotImplementedError extends AppError {
    constructor(provider: string, method: string);
}
export declare function withGitPlatformErrorBoundary<T>(operation: () => Promise<T>, provider: string, logger?: Logger, context?: ErrorContext): Promise<T>;
export interface RetryOptions {
    maxAttempts?: number;
    baseDelayMs?: number;
    maxDelayMs?: number;
    isRetryable?: (err: unknown) => boolean;
}
export declare function withRetry<T>(operation: () => Promise<T>, options?: RetryOptions): Promise<T>;
