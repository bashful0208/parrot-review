import type { GiteePatCredential } from "../credentials.js";
export interface GiteeRequestOptions {
    method?: "GET" | "POST" | "PATCH" | "DELETE";
    query?: Record<string, string | number | undefined>;
    body?: Record<string, unknown>;
}
/**
 * 抛出与 GitHub Octokit 错误形态兼容的错误对象，
 * 让 withGitPlatformErrorBoundary 可以统一识别 status / retry-after。
 */
export declare class GiteeRequestError extends Error {
    readonly status: number;
    readonly response: {
        headers: Record<string, string>;
    };
    constructor(status: number, message: string, headers: Record<string, string>);
}
export interface GiteeClient {
    request<T>(path: string, options?: GiteeRequestOptions): Promise<T>;
}
export declare function getGiteePatClient(cred: GiteePatCredential): GiteeClient;
