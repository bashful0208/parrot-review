import { AppError, ErrorCode, type ErrorContext, type Logger } from "@reviewer/core";

export class GitPlatformApiError extends AppError {
  readonly providerStatusCode: number | undefined;

  constructor(
    provider: string,
    message: string,
    context?: ErrorContext,
    statusCode?: number
  ) {
    super(ErrorCode.DependencyApiTimeout, message, { ...context, provider });
    this.name = "GitPlatformApiError";
    this.providerStatusCode = statusCode;
  }
}

export class GitPlatformRateLimitError extends AppError {
  readonly retryAfterMs: number | undefined;

  constructor(
    provider: string,
    message: string,
    context?: ErrorContext,
    retryAfterMs?: number
  ) {
    super(ErrorCode.DependencyApiRateLimit, message, { ...context, provider });
    this.name = "GitPlatformRateLimitError";
    this.retryAfterMs = retryAfterMs;
  }
}

export class GitPlatformAuthError extends AppError {
  constructor(provider: string, message: string, context?: ErrorContext) {
    super(ErrorCode.PlatformCallbackAuthFailed, message, {
      ...context,
      provider,
    });
    this.name = "GitPlatformAuthError";
  }
}

export class GitWebhookSignatureError extends AppError {
  constructor(provider: string, context?: ErrorContext) {
    super(
      ErrorCode.PlatformCallbackInvalidSignature,
      `Webhook signature verification failed for provider: ${provider}`,
      { ...context, provider }
    );
    this.name = "GitWebhookSignatureError";
  }
}

export class GitProviderNotImplementedError extends AppError {
  constructor(provider: string, method: string) {
    super(
      ErrorCode.PlatformCallback,
      `${provider} provider method '${method}' is not yet implemented`,
      { provider, operation: method }
    );
    this.name = "GitProviderNotImplementedError";
  }
}

export async function withGitPlatformErrorBoundary<T>(
  operation: () => Promise<T>,
  provider: string,
  logger?: Logger,
  context?: ErrorContext
): Promise<T> {
  try {
    return await operation();
  } catch (error: unknown) {
    const err = error as Record<string, unknown>;
    const status = err?.["status"] as number | undefined;
    const headers = (
      err?.["response"] as Record<string, unknown> | undefined
    )?.["headers"] as Record<string, string> | undefined;
    const retryAfterHeader = headers?.["retry-after"];

    // GitHub 次级限流：403 + Retry-After
    if (status === 403 && retryAfterHeader != null) {
      const retryAfterMs = Number(retryAfterHeader) * 1000;
      const rateErr = new GitPlatformRateLimitError(
        provider,
        `Secondary rate limit: retry after ${retryAfterMs}ms`,
        context,
        retryAfterMs
      );
      logger?.warn("Git platform secondary rate limit hit", {
        provider,
        retryAfterMs,
      });
      throw rateErr;
    }

    // Primary rate limit：429
    if (status === 429) {
      const retryAfterMs = retryAfterHeader != null
        ? Number(retryAfterHeader) * 1000
        : undefined;
      const rateErr = new GitPlatformRateLimitError(
        provider,
        "Rate limit exceeded",
        context,
        retryAfterMs
      );
      logger?.warn("Git platform rate limit exceeded", { provider, retryAfterMs });
      throw rateErr;
    }

    // 认证失败
    if (status === 401 || status === 403) {
      throw new GitPlatformAuthError(
        provider,
        `Auth failed: ${String(err?.["message"] ?? "unauthorized")}`,
        context
      );
    }

    // 其他 4xx/5xx
    if (status != null && status >= 400) {
      throw new GitPlatformApiError(
        provider,
        String(err?.["message"] ?? "API error"),
        context,
        status
      );
    }

    throw error;
  }
}
