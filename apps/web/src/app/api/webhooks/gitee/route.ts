import { type NextRequest, NextResponse } from "next/server";

import {
  createLogger,
  enqueueWebhookJob,
  findRepoIntegrationByProviderRepoId,
  insertWebhookEvent,
} from "@reviewer/core";
import { GiteeProvider } from "@reviewer/git";

const logger = createLogger({ component: "api" });
const provider = new GiteeProvider();

export async function POST(req: NextRequest): Promise<NextResponse> {
  const rawBody = await req.text();
  const headers = Object.fromEntries(req.headers.entries());

  // P0: 使用全局 WEBHOOK_SECRET 验证签名。
  // 生产环境应按仓库从 vault 读取各自的 webhook secret。
  const webhookSecret = process.env.WEBHOOK_SECRET ?? "";

  const event = await provider.normalizeWebhookEvent(headers, rawBody, webhookSecret);

  if (!event.signatureValid) {
    logger.warn("Gitee webhook signature invalid", {
      delivery_id: event.deliveryId,
      event_type: event.eventType,
    });
    return NextResponse.json({ ok: false, error: "Invalid signature" }, { status: 401 });
  }

  let repoIntegration = null;
  if (event.providerRepoId != null) {
    repoIntegration = await findRepoIntegrationByProviderRepoId(
      "gitee",
      event.providerRepoId
    );
  }

  const record = await insertWebhookEvent({
    organizationId: repoIntegration?.organization_id ?? null,
    repositoryId: repoIntegration?.repository_id ?? null,
    provider: "gitee",
    eventType: event.eventType,
    deliveryId: event.deliveryId,
    signatureValid: event.signatureValid,
    rawBody,
    payload: event.rawPayload,
  });

  if (record == null) {
    logger.info("Duplicate Gitee webhook delivery ignored", {
      delivery_id: event.deliveryId,
    });
    return NextResponse.json({ ok: true, duplicate: true });
  }

  logger.info("Gitee webhook event recorded", {
    webhook_event_id: record.id,
    delivery_id: event.deliveryId,
    event_type: event.eventType,
    review_trigger: event.reviewTrigger,
    repository_id: repoIntegration?.repository_id,
  });

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
      provider: "gitee",
      prNumber: event.providerPrNumber,
      headSha: event.headSha,
      baseSha: event.baseSha,
    });

    logger.info("Review job enqueued from Gitee webhook", {
      webhook_event_id: record.id,
      pr_number: event.providerPrNumber,
      review_trigger: event.reviewTrigger,
    });
  }

  return NextResponse.json({ ok: true }, { status: 202 });
}
