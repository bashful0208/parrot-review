import { AppError, ErrorCode } from "../errors.js";
import { createLogger, type Logger } from "../logging.js";

/**
 * Provider 适配器视角的最小接口。让 registrar 与 @reviewer/git 解耦，
 * 调用方传入已构建好的 provider 实例与 credential。
 */
export interface WebhookRegistrarProvider {
  listWebhooks(
    fullName: string,
    credential: unknown,
    logger?: Logger
  ): Promise<Array<{ hookId: string; url: string; active: boolean }>>;
  createWebhook(
    fullName: string,
    input: { url: string; secret: string; events: string[] },
    credential: unknown,
    logger?: Logger
  ): Promise<{ hookId: string; url: string; active: boolean }>;
}

export type WebhookRegistrationStatus = "created" | "already_exists";

export interface WebhookRegistrationResult {
  status: WebhookRegistrationStatus;
  hookId: string;
}

export interface RegisterRepoWebhookInput {
  provider: WebhookRegistrarProvider;
  /** repo full_name，如 "owner/repo" */
  fullName: string;
  /** 完整 webhook 接收 URL，调用方负责拼好（含协议与路径） */
  webhookUrl: string;
  /** webhook secret（用于签名校验） */
  secret: string;
  /** provider 接受的 credential 对象（已解密的 PAT 等） */
  credential: unknown;
  /** 事件订阅列表；默认 ["pull_request"] */
  events?: string[];
}

/**
 * 在目标仓库注册 webhook，幂等：list 命中同 URL 直接返回 already_exists。
 * 失败时按状态码 / AppError code 分类为 WEBHOOK_* 错误码抛出。
 *
 * 不在这里做 DB 写入；调用方拿到结果或异常后自行更新 repo_integrations.metadata。
 */
export async function registerRepoWebhook(
  input: RegisterRepoWebhookInput
): Promise<WebhookRegistrationResult> {
  const logger = createLogger({ component: "api" });
  const events = input.events ?? ["pull_request"];

  try {
    const existing = await input.provider.listWebhooks(
      input.fullName,
      input.credential,
      logger
    );
    const hit = existing.find((h) => h.url === input.webhookUrl);
    if (hit) {
      logger.info("Webhook already registered, reusing", {
        full_name: input.fullName,
        hook_id: hit.hookId,
      });
      return { status: "already_exists", hookId: hit.hookId };
    }
  } catch (err) {
    throw classifyProviderError(err, "listWebhooks", input.fullName);
  }

  try {
    const created = await input.provider.createWebhook(
      input.fullName,
      { url: input.webhookUrl, secret: input.secret, events },
      input.credential,
      logger
    );
    return { status: "created", hookId: created.hookId };
  } catch (err) {
    throw classifyProviderError(err, "createWebhook", input.fullName);
  }
}

/**
 * 把 provider 抛出的异常分类成 WEBHOOK_* AppError。
 * - PlatformCallbackAuthFailed (401/403) → WebhookPermissionDenied
 * - PlatformCallback (GitProviderNotImplementedError) → WebhookUnsupported
 * - DependencyApiTimeout / 5xx / 网络 → WebhookProviderUnavailable
 * - 其他 AppError 保留原 code，但归类成 ProviderUnavailable（最弱断言）
 */
function classifyProviderError(
  err: unknown,
  operation: string,
  fullName: string
): AppError {
  if (err instanceof AppError) {
    if (err.code === ErrorCode.PlatformCallbackAuthFailed) {
      return new AppError(
        ErrorCode.WebhookPermissionDenied,
        `Provider rejected webhook ${operation} (token may lack required scope): ${err.message}`,
        { ...err.context, full_name: fullName, operation }
      );
    }
    if (
      err.code === ErrorCode.PlatformCallback &&
      err.name === "GitProviderNotImplementedError"
    ) {
      return new AppError(
        ErrorCode.WebhookUnsupported,
        `Provider does not support webhook auto-registration: ${err.message}`,
        { ...err.context, full_name: fullName, operation }
      );
    }
    return new AppError(
      ErrorCode.WebhookProviderUnavailable,
      `Provider error during ${operation}: ${err.message}`,
      { ...err.context, full_name: fullName, operation }
    );
  }
  const message = err instanceof Error ? err.message : String(err);
  return new AppError(
    ErrorCode.WebhookProviderUnavailable,
    `Unexpected error during ${operation}: ${message}`,
    { full_name: fullName, operation }
  );
}
