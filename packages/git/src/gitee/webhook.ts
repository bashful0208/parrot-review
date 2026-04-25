import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import type { ReviewTrigger } from "@reviewer/db-types";
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
export function verifyGiteeWebhookSignature(
  rawHeaders: Record<string, string>,
  secret: string
): boolean {
  if (!secret) return false;

  const tokenHeader = headerOf(rawHeaders, "x-gitee-token");
  const timestampHeader = headerOf(rawHeaders, "x-gitee-timestamp");

  if (!tokenHeader) return false;

  // password 模式
  if (constantTimeEqual(tokenHeader, secret)) return true;

  // HMAC 模式
  if (timestampHeader) {
    const stringToSign = `${timestampHeader}\n${secret}`;
    const expected = createHmac("sha256", secret)
      .update(stringToSign, "utf8")
      .digest("base64");
    if (constantTimeEqual(tokenHeader, expected)) return true;
  }

  return false;
}

function headerOf(
  headers: Record<string, string>,
  lowerName: string
): string | undefined {
  return (
    headers[lowerName] ??
    headers[lowerName.toUpperCase()] ??
    headers[
      lowerName.replace(/(^|-)([a-z])/g, (_, p1, p2) => p1 + p2.toUpperCase())
    ]
  );
}

function constantTimeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

const ACTION_TO_TRIGGER: Record<string, ReviewTrigger> = {
  open: "pr_opened",
  update: "pr_synchronize",
  reopen: "pr_reopened",
};

export function normalizeGiteeEvent(
  rawHeaders: Record<string, string>,
  rawBody: string,
  webhookSecret: string
): NormalizedWebhookEvent {
  const signatureValid = verifyGiteeWebhookSignature(rawHeaders, webhookSecret);

  const eventType = headerOf(rawHeaders, "x-gitee-event") ?? "";
  // Gitee 不提供稳定 delivery ID，使用 timestamp + payload SHA256 前缀拼接，
  // 既能保留时间维度可读性，又能保证不同事件唯一。
  const timestamp = headerOf(rawHeaders, "x-gitee-timestamp") ?? "0";
  const payloadDigest = createHash("sha256")
    .update(rawBody, "utf8")
    .digest("hex")
    .slice(0, 16);
  const deliveryId = `${timestamp}-${payloadDigest}`;

  const rawPayload = JSON.parse(rawBody) as Record<string, unknown>;

  const base: NormalizedWebhookEvent = {
    provider: "gitee",
    deliveryId,
    eventType,
    signatureValid,
    rawPayload,
  };

  // 仅 PR Hook（"Merge Request Hook"）参与审查触发
  if (eventType !== "Merge Request Hook") {
    return base;
  }

  const action = rawPayload["action"] as string | undefined;
  const reviewTrigger = action != null ? ACTION_TO_TRIGGER[action] : undefined;

  const repo = rawPayload["repository"] as Record<string, unknown> | undefined;
  const pr = rawPayload["pull_request"] as Record<string, unknown> | undefined;

  return {
    ...base,
    reviewTrigger,
    providerRepoId: repo != null ? String(repo["id"]) : undefined,
    providerPrNumber:
      pr != null ? Number((pr as Record<string, unknown>)["number"]) : undefined,
    headSha: (pr?.["head"] as Record<string, unknown> | undefined)?.["sha"] as
      | string
      | undefined,
    baseSha: (pr?.["base"] as Record<string, unknown> | undefined)?.["sha"] as
      | string
      | undefined,
  };
}
