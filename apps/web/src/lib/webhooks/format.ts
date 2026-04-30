export type WebhookRangeKey = "24h" | "7d" | "30d";
export type WebhookProvider = "github" | "gitee";

export function parseWebhookRangeDays(input: string | undefined | null): number {
  switch (input) {
    case "24h":
      return 1;
    case "7d":
      return 7;
    case "30d":
      return 30;
    default:
      return 1;
  }
}

export function rangeKeyFromDays(days: number): WebhookRangeKey {
  if (days >= 30) return "30d";
  if (days >= 7) return "7d";
  return "24h";
}

export function parseWebhookProvider(
  input: string | undefined | null
): WebhookProvider | null {
  if (input === "github" || input === "gitee") return input;
  return null;
}

export function parseWebhookPage(input: string | undefined | null): number {
  const n = Number(input);
  if (!Number.isFinite(n)) return 1;
  if (n < 1) return 1;
  return Math.floor(n);
}

export function formatPayloadSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "0 B";
  if (bytes < 1024) return `${Math.floor(bytes)} B`;
  const KB = bytes / 1024;
  if (KB < 1024) return `${KB.toFixed(1)} KB`;
  const MB = KB / 1024;
  return `${MB.toFixed(1)} MB`;
}

/** Build an href that preserves the other current filters. */
export function buildWebhooksHref(params: {
  range?: WebhookRangeKey;
  provider?: WebhookProvider | "all";
  page?: number;
}): string {
  const sp = new URLSearchParams();
  if (params.range && params.range !== "24h") sp.set("range", params.range);
  if (params.provider && params.provider !== "all") sp.set("provider", params.provider);
  if (params.page && params.page > 1) sp.set("page", String(params.page));
  const qs = sp.toString();
  return qs ? `/webhooks?${qs}` : "/webhooks";
}
