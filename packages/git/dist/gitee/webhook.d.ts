import type { NormalizedWebhookEvent } from "../domain/webhook.js";
/**
 * Gitee 支持两种 webhook 校验方式：
 *
 * 1) 密码（password）模式：`X-Gitee-Token` 直接等于配置的 secret。
 * 2) 签名（HMAC）模式：`X-Gitee-Timestamp` + `X-Gitee-Token` 联合签名，
 *    `X-Gitee-Token` 为 base64(HMACSHA256(timestamp + "\n" + secret, secret))。
 *
 * 我们对两种方式都尝试一次，只要任一通过即视为合法。
 */
export declare function verifyGiteeWebhookSignature(rawHeaders: Record<string, string>, secret: string): boolean;
export declare function normalizeGiteeEvent(rawHeaders: Record<string, string>, rawBody: string, webhookSecret: string): NormalizedWebhookEvent;
