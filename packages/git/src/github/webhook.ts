import { createHmac, timingSafeEqual } from "node:crypto";
import type { ReviewTrigger } from "@reviewer/db-types";
import type { NormalizedWebhookEvent } from "../domain/webhook.js";

export function verifyGitHubWebhookSignature(
  rawBody: string,
  signatureHeader: string | undefined,
  secret: string
): boolean {
  if (!signatureHeader?.startsWith("sha256=")) {
    return false;
  }
  const digest = createHmac("sha256", secret)
    .update(rawBody, "utf8")
    .digest("hex");
  const expected = Buffer.from(`sha256=${digest}`, "ascii");
  const received = Buffer.from(signatureHeader, "ascii");
  if (expected.length !== received.length) {
    return false;
  }
  return timingSafeEqual(expected, received);
}

const ACTION_TO_TRIGGER: Record<string, ReviewTrigger> = {
  opened: "pr_opened",
  synchronize: "pr_synchronize",
  reopened: "pr_reopened",
};

export function normalizeGitHubEvent(
  headers: Record<string, string>,
  rawBody: string,
  webhookSecret: string
): NormalizedWebhookEvent {
  const signatureHeader =
    headers["x-hub-signature-256"] ?? headers["X-Hub-Signature-256"];
  const signatureValid = verifyGitHubWebhookSignature(
    rawBody,
    signatureHeader,
    webhookSecret
  );

  const deliveryId =
    headers["x-github-delivery"] ?? headers["X-GitHub-Delivery"] ?? "";
  const eventType =
    headers["x-github-event"] ?? headers["X-GitHub-Event"] ?? "";

  const rawPayload = JSON.parse(rawBody) as Record<string, unknown>;

  const base: NormalizedWebhookEvent = {
    provider: "github",
    deliveryId,
    eventType,
    signatureValid,
    rawPayload,
  };

  if (eventType !== "pull_request") {
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
