import type { GitProvider, ReviewTrigger } from "@reviewer/db-types";

export interface NormalizedWebhookEvent {
  provider: GitProvider;
  deliveryId: string;
  eventType: string;
  signatureValid: boolean;
  rawPayload: Record<string, unknown>;
  reviewTrigger?: ReviewTrigger;
  providerRepoId?: string;
  providerPrNumber?: number;
  headSha?: string;
  baseSha?: string;
}
