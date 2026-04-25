import type { GiteePatCredential } from "../credentials.js";

const GITEE_API_BASE = "https://gitee.com/api/v5";

export interface GiteeRequestOptions {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  query?: Record<string, string | number | undefined>;
  body?: Record<string, unknown>;
}

/**
 * 抛出与 GitHub Octokit 错误形态兼容的错误对象，
 * 让 withGitPlatformErrorBoundary 可以统一识别 status / retry-after。
 */
export class GiteeRequestError extends Error {
  readonly status: number;
  readonly response: { headers: Record<string, string> };

  constructor(
    status: number,
    message: string,
    headers: Record<string, string>
  ) {
    super(message);
    this.name = "GiteeRequestError";
    this.status = status;
    this.response = { headers };
  }
}

export interface GiteeClient {
  request<T>(path: string, options?: GiteeRequestOptions): Promise<T>;
}

function buildUrl(
  path: string,
  query: Record<string, string | number | undefined> | undefined,
  token: string
): string {
  const url = new URL(`${GITEE_API_BASE}${path}`);
  url.searchParams.set("access_token", token);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined) url.searchParams.set(k, String(v));
    }
  }
  return url.toString();
}

export function getGiteePatClient(cred: GiteePatCredential): GiteeClient {
  return {
    async request<T>(path: string, options: GiteeRequestOptions = {}): Promise<T> {
      const { method = "GET", query, body } = options;
      const url = buildUrl(path, query, cred.token);

      const headers: Record<string, string> = { Accept: "application/json" };
      let init: RequestInit = { method, headers };
      if (body !== undefined) {
        headers["Content-Type"] = "application/json;charset=UTF-8";
        init = { ...init, body: JSON.stringify(body) };
      }

      const res = await fetch(url, init);
      const respHeaders: Record<string, string> = {};
      res.headers.forEach((v, k) => {
        respHeaders[k.toLowerCase()] = v;
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new GiteeRequestError(
          res.status,
          `Gitee API ${method} ${path} failed: ${res.status} ${text.slice(0, 500)}`,
          respHeaders
        );
      }

      if (res.status === 204) {
        return undefined as T;
      }
      return (await res.json()) as T;
    },
  };
}
