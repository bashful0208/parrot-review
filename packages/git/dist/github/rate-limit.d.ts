export interface RateLimitInfo {
    remaining: number | undefined;
    resetAt: Date | undefined;
    retryAfterMs: number | undefined;
}
export declare function extractRateLimitInfo(headers: Record<string, string | string[] | undefined>): RateLimitInfo;
