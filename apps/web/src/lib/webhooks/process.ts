import type {
  Logger,
  RepoIntegrationLookup,
  WebhookEventRecord,
  WebhookJobPayload,
} from "@reviewer/core";
import type { NormalizedWebhookEvent } from "@reviewer/git";

import { extractProviderRepoId } from "./extract-repo-id";

/**
 * 处理一次 webhook 调用的纯逻辑：解析 → 按仓库查 secret → 验签 → 落库 → 入队。
 * 把所有外部副作用通过 deps 注入，便于测试与跨 provider 复用。
 */
export interface WebhookProcessDeps {
  findRepoIntegration: (
    provider: string,
    providerRepoId: string
  ) => Promise<RepoIntegrationLookup | null>;
  insertEvent: (input: {
    organizationId: string | null;
    repositoryId: string | null;
    provider: string;
    eventType: string;
    deliveryId: string;
    signatureValid: boolean;
    rawBody: string;
    payload: Record<string, unknown>;
  }) => Promise<WebhookEventRecord | null>;
  enqueueJob: (payload: WebhookJobPayload) => Promise<unknown>;
  normalize: (
    headers: Record<string, string>,
    rawBody: string,
    secret: string
  ) => Promise<NormalizedWebhookEvent>;
  /** Best-effort status write for the persisted webhook_events row.
   * Implementations should swallow DB errors so audit failures never
   * break the inbound webhook flow. */
  markEventStatus: (
    id: string,
    status: "received" | "unmatched" | "enqueued" | "processed" | "failed",
    errorMessage?: string | null
  ) => Promise<void>;
  logger: Logger;
}

export type WebhookResult =
  | { status: 200; body: { ok: true; unmatched: true } }
  | { status: 200; body: { ok: true; duplicate: true } }
  | { status: 202; body: { ok: true } }
  | { status: 401; body: { ok: false; error: string } };

export async function processProviderWebhook(
  provider: "gitee" | "github",
  rawBody: string,
  headers: Record<string, string>,
  deps: WebhookProcessDeps
): Promise<WebhookResult> {
  const { findRepoIntegration, insertEvent, enqueueJob, normalize, markEventStatus, logger } = deps;

  const providerRepoId = extractProviderRepoId(rawBody);
  const repoIntegration = providerRepoId
    ? await findRepoIntegration(provider, providerRepoId)
    : null;

  if (repoIntegration == null) {
    const event = await normalize(headers, rawBody, "");
    const unmatchedRecord = await insertEvent({
      organizationId: null,
      repositoryId: null,
      provider,
      eventType: event.eventType,
      deliveryId: event.deliveryId,
      signatureValid: false,
      rawBody,
      payload: event.rawPayload,
    });
    if (unmatchedRecord) {
      await markEventStatus(unmatchedRecord.id, "unmatched");
    }
    logger.warn(`${provider} webhook received for unmatched repo`, {
      provider_repo_id: providerRepoId,
      delivery_id: event.deliveryId,
      event_type: event.eventType,
    });
    return { status: 200, body: { ok: true, unmatched: true } };
  }

  const event = await normalize(headers, rawBody, repoIntegration.webhook_secret);

  if (!event.signatureValid) {
    logger.warn(`${provider} webhook signature invalid`, {
      delivery_id: event.deliveryId,
      event_type: event.eventType,
      repository_id: repoIntegration.repository_id,
    });
    return { status: 401, body: { ok: false, error: "Invalid signature" } };
  }

  const record = await insertEvent({
    organizationId: repoIntegration.organization_id,
    repositoryId: repoIntegration.repository_id,
    provider,
    eventType: event.eventType,
    deliveryId: event.deliveryId,
    signatureValid: event.signatureValid,
    rawBody,
    payload: event.rawPayload,
  });

  if (record == null) {
    logger.info(`Duplicate ${provider} webhook delivery ignored`, {
      delivery_id: event.deliveryId,
    });
    return { status: 200, body: { ok: true, duplicate: true } };
  }

  logger.info(`${provider} webhook event recorded`, {
    webhook_event_id: record.id,
    delivery_id: event.deliveryId,
    event_type: event.eventType,
    review_trigger: event.reviewTrigger,
    repository_id: repoIntegration.repository_id,
  });

  if (
    event.reviewTrigger != null &&
    event.providerPrNumber != null &&
    event.headSha != null &&
    event.baseSha != null
  ) {
    try {
      await enqueueJob({
        source: "webhook",
        webhookEventId: record.id,
        repositoryId: repoIntegration.repository_id,
        organizationId: repoIntegration.organization_id,
        provider,
        prNumber: event.providerPrNumber,
        headSha: event.headSha,
        baseSha: event.baseSha,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await markEventStatus(record.id, "failed", `enqueue: ${message}`);
      throw err;
    }

    await markEventStatus(record.id, "enqueued");
    logger.info(`Review job enqueued from ${provider} webhook`, {
      webhook_event_id: record.id,
      pr_number: event.providerPrNumber,
      review_trigger: event.reviewTrigger,
    });
  } else {
    // Non-reviewable event (e.g. ping, push to non-PR ref) — terminal.
    await markEventStatus(record.id, "processed");
  }

  return { status: 202, body: { ok: true } };
}
