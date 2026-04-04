export interface RateLimitInfo {
  remaining: number | undefined;
  resetAt: Date | undefined;
  retryAfterMs: number | undefined;
}

export function extractRateLimitInfo(
  headers: Record<string, string | string[] | undefined>
): RateLimitInfo {
  const remaining = headers["x-ratelimit-remaining"] != null
    ? Number(headers["x-ratelimit-remaining"])
    : undefined;

  const resetEpoch = headers["x-ratelimit-reset"] != null
    ? Number(headers["x-ratelimit-reset"])
    : undefined;
  const resetAt = resetEpoch != null ? new Date(resetEpoch * 1000) : undefined;

  const retryAfter = headers["retry-after"];
  const retryAfterMs = retryAfter != null ? Number(retryAfter) * 1000 : undefined;

  return { remaining, resetAt, retryAfterMs };
}
