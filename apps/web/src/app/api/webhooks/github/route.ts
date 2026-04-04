import { type NextRequest, NextResponse } from "next/server";

import {
  createLogger,
  enqueueWebhookJob,
  findRepoIntegrationByProviderRepoId,
  insertWebhookEvent,
} from "@reviewer/core";
import { GitHubProvider } from "@reviewer/git";

const logger = createLogger({ component: "api" });
const provider = new GitHubProvider();

export async function POST(req: NextRequest): Promise<NextResponse> {
  const rawBody = await req.text();
  const headers = Object.fromEntries(req.headers.entries());

  // P0: 使用全局 WEBHOOK_SECRET 验证签名。
  // 生产环境应按仓库从 vault 读取各自的 webhook secret。
  const webhookSecret = process.env.WEBHOOK_SECRET ?? "";

  const event = await provider.normalizeWebhookEvent(headers, rawBody, webhookSecret);

  if (!event.signatureValid) {
    logger.warn("GitHub webhook signature invalid", {
      delivery_id: event.deliveryId,
      event_type: event.eventType,
    });
    return NextResponse.json({ ok: false, error: "Invalid signature" }, { status: 401 });
  }

  // 查找关联仓库（可能尚未接入，允许为 null）
  let repoIntegration = null;
  if (event.providerRepoId != null) {
    repoIntegration = await findRepoIntegrationByProviderRepoId(
      "github",
      event.providerRepoId
    );
  }

  // 写入 webhook_events，ON CONFLICT DO NOTHING 实现幂等
  const record = await insertWebhookEvent({
    organizationId: repoIntegration?.organization_id ?? null,
    repositoryId: repoIntegration?.repository_id ?? null,
    provider: "github",
    eventType: event.eventType,
    deliveryId: event.deliveryId,
    signatureValid: event.signatureValid,
    rawBody,
    payload: event.rawPayload,
  });

  if (record == null) {
    logger.info("Duplicate GitHub webhook delivery ignored", {
      delivery_id: event.deliveryId,
    });
    return NextResponse.json({ ok: true, duplicate: true });
  }

  logger.info("GitHub webhook event recorded", {
    webhook_event_id: record.id,
    delivery_id: event.deliveryId,
    event_type: event.eventType,
    review_trigger: event.reviewTrigger,
    repository_id: repoIntegration?.repository_id,
  });

  // 入队：仅当事件可触发审查、仓库已接入、且关键字段齐全
  if (
    event.reviewTrigger != null &&
    repoIntegration != null &&
    event.providerPrNumber != null &&
    event.headSha != null &&
    event.baseSha != null
  ) {
    await enqueueWebhookJob({
      source: "webhook",
      webhookEventId: record.id,
      repositoryId: repoIntegration.repository_id,
      organizationId: repoIntegration.organization_id,
      provider: "github",
      prNumber: event.providerPrNumber,
      headSha: event.headSha,
      baseSha: event.baseSha,
    });

    logger.info("Review job enqueued from webhook", {
      webhook_event_id: record.id,
      pr_number: event.providerPrNumber,
      review_trigger: event.reviewTrigger,
    });
  }

  return NextResponse.json({ ok: true }, { status: 202 });
}
