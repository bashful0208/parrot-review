import type { Logger, ErrorContext } from "@reviewer/core";
import type {
  FileDiff,
  Installation,
  PostedComment,
  ProviderPullRequest,
  ProviderRepository,
  ReviewCommentInput,
} from "../domain/models.js";
import type { NormalizedWebhookEvent } from "../domain/webhook.js";
import type { ProviderCredential } from "../credentials.js";
import type {
  IProvider,
  ListPullRequestsOptions,
  ListRepositoriesOptions,
} from "../provider.js";
import { withGitPlatformErrorBoundary } from "../errors.js";
import { getGiteePatClient } from "./client.js";
import { computeDiffPosition } from "./diff-position.js";
import {
  mapFileDiff,
  mapPostedComment,
  mapPullRequest,
  mapRepository,
  type GiteeComment,
  type GiteeFile,
  type GiteePR,
  type GiteeRepo,
} from "./mappers.js";
import { normalizeGiteeEvent } from "./webhook.js";

const PROVIDER = "gitee" as const;

function assertGitee(credential: ProviderCredential) {
  if (credential.type !== "gitee_pat") {
    throw new TypeError(
      `GiteeProvider requires gitee_pat credential, got: ${credential.type}`
    );
  }
  return credential;
}

function context(extra?: Record<string, unknown>): ErrorContext {
  return { provider: PROVIDER, ...extra };
}

function splitFullName(fullName: string): { owner: string; repo: string } {
  const [owner, repo] = fullName.split("/");
  if (!owner || !repo) {
    throw new Error(`Invalid Gitee repository full_name: ${fullName}`);
  }
  return { owner, repo };
}

export class GiteeProvider implements IProvider {
  readonly provider = PROVIDER;

  async getInstallation(
    _installationId: string,
    credential: ProviderCredential,
    logger?: Logger
  ): Promise<Installation> {
    // Gitee 仅支持 PAT，"installation" 概念用当前 user 代替。
    const cred = assertGitee(credential);
    const client = getGiteePatClient(cred);
    return withGitPlatformErrorBoundary(
      async () => {
        const data = await client.request<{ id: number; login: string }>(
          "/user"
        );
        logger?.debug("Fetched Gitee user (as installation)", {
          login: data.login,
        });
        return {
          installationId: String(data.id),
          provider: PROVIDER,
          providerOwnerId: String(data.id),
          organizationId: "",
          repositoryId: "",
        };
      },
      PROVIDER,
      logger,
      context({ operation: "getInstallation" })
    );
  }

  async listRepositories(
    credential: ProviderCredential,
    options?: ListRepositoriesOptions,
    logger?: Logger
  ): Promise<ProviderRepository[]> {
    const cred = assertGitee(credential);
    const client = getGiteePatClient(cred);
    return withGitPlatformErrorBoundary(
      async () => {
        const data = await client.request<GiteeRepo[]>("/user/repos", {
          query: {
            sort: "updated",
            page: options?.page ?? 1,
            per_page: options?.perPage ?? 30,
          },
        });
        logger?.debug("Listed Gitee repositories", { count: data.length });
        return data.map(mapRepository);
      },
      PROVIDER,
      logger,
      context({ operation: "listRepositories" })
    );
  }

  async getRepository(
    fullName: string,
    credential: ProviderCredential,
    logger?: Logger
  ): Promise<ProviderRepository> {
    const { owner, repo } = splitFullName(fullName);
    const cred = assertGitee(credential);
    const client = getGiteePatClient(cred);
    return withGitPlatformErrorBoundary(
      async () => {
        const data = await client.request<GiteeRepo>(
          `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`
        );
        logger?.debug("Fetched Gitee repository", { fullName });
        return mapRepository(data);
      },
      PROVIDER,
      logger,
      context({ operation: "getRepository", repository: fullName })
    );
  }

  async listPullRequests(
    fullName: string,
    credential: ProviderCredential,
    options?: ListPullRequestsOptions,
    logger?: Logger
  ): Promise<ProviderPullRequest[]> {
    const { owner, repo } = splitFullName(fullName);
    const cred = assertGitee(credential);
    const client = getGiteePatClient(cred);
    return withGitPlatformErrorBoundary(
      async () => {
        const data = await client.request<GiteePR[]>(
          `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls`,
          {
            query: {
              state: options?.state ?? "open",
              page: options?.page ?? 1,
              per_page: options?.perPage ?? 30,
            },
          }
        );
        logger?.debug("Listed Gitee pull requests", {
          fullName,
          count: data.length,
        });
        return data.map(mapPullRequest);
      },
      PROVIDER,
      logger,
      context({ operation: "listPullRequests", repository: fullName })
    );
  }

  async getPullRequest(
    fullName: string,
    prNumber: number,
    credential: ProviderCredential,
    logger?: Logger
  ): Promise<ProviderPullRequest> {
    const { owner, repo } = splitFullName(fullName);
    const cred = assertGitee(credential);
    const client = getGiteePatClient(cred);
    return withGitPlatformErrorBoundary(
      async () => {
        const data = await client.request<GiteePR>(
          `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls/${prNumber}`
        );
        logger?.debug("Fetched Gitee pull request", { fullName, prNumber });
        return mapPullRequest(data);
      },
      PROVIDER,
      logger,
      context({ operation: "getPullRequest", repository: fullName })
    );
  }

  async getPullRequestDiff(
    fullName: string,
    prNumber: number,
    credential: ProviderCredential,
    logger?: Logger
  ): Promise<FileDiff[]> {
    const { owner, repo } = splitFullName(fullName);
    const cred = assertGitee(credential);
    const client = getGiteePatClient(cred);
    return withGitPlatformErrorBoundary(
      async () => {
        const data = await client.request<GiteeFile[]>(
          `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls/${prNumber}/files`
        );
        logger?.debug("Fetched Gitee PR diff", {
          fullName,
          prNumber,
          fileCount: data.length,
        });
        return data.map(mapFileDiff);
      },
      PROVIDER,
      logger,
      context({ operation: "getPullRequestDiff", repository: fullName })
    );
  }

  async compareCommits(
    fullName: string,
    base: string,
    head: string,
    credential: ProviderCredential,
    logger?: Logger
  ): Promise<FileDiff[]> {
    const { owner, repo } = splitFullName(fullName);
    const cred = assertGitee(credential);
    const client = getGiteePatClient(cred);
    return withGitPlatformErrorBoundary(
      async () => {
        const data = await client.request<{ files?: GiteeFile[] }>(
          `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/compare/${encodeURIComponent(
            `${base}...${head}`
          )}`
        );
        const files = data.files ?? [];
        logger?.debug("Fetched Gitee compare diff", {
          fullName,
          base,
          head,
          fileCount: files.length,
        });
        return files.map(mapFileDiff);
      },
      PROVIDER,
      logger,
      context({ operation: "compareCommits", repository: fullName })
    );
  }

  async postReviewComment(
    fullName: string,
    input: ReviewCommentInput,
    credential: ProviderCredential,
    logger?: Logger
  ): Promise<PostedComment> {
    const { owner, repo } = splitFullName(fullName);
    const cred = assertGitee(credential);
    const client = getGiteePatClient(cred);
    const position = computeDiffPosition(input.patch, input.line, input.side);
    if (position === null) {
      // Target line is outside diff range — fallback to PR conversation comment
      logger?.warn("Gitee diff position not found, falling back to PR conversation comment", {
        filePath: input.filePath,
        line: input.line,
        side: input.side,
      });
      const fallbackBody =
        `**${input.filePath}** (line ${input.line}, ${input.side})\n\n${input.bodyMd}`;
      return this.postPullRequestComment(fullName, input.prNumber, fallbackBody, credential, logger);
    }
    return withGitPlatformErrorBoundary(
      async () => {
        // Gitee 行级评论：position 是该行在 unified diff 中的行号（不是文件行号）
        const data = await client.request<GiteeComment>(
          `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls/${input.prNumber}/comments`,
          {
            method: "POST",
            body: {
              body: input.bodyMd,
              commit_id: input.commitSha,
              path: input.filePath,
              position,
            },
          }
        );
        logger?.debug("Posted Gitee review comment", {
          fullName,
          prNumber: input.prNumber,
          commentId: data.id,
        });
        return mapPostedComment(data);
      },
      PROVIDER,
      logger,
      context({ operation: "postReviewComment", repository: fullName })
    );
  }

  async postPullRequestComment(
    fullName: string,
    prNumber: number,
    bodyMd: string,
    credential: ProviderCredential,
    logger?: Logger
  ): Promise<PostedComment> {
    const { owner, repo } = splitFullName(fullName);
    const cred = assertGitee(credential);
    const client = getGiteePatClient(cred);
    return withGitPlatformErrorBoundary(
      async () => {
        // Gitee PR 整体评论：仅传 body（不带 path / position 即落在会话区）
        const data = await client.request<GiteeComment>(
          `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls/${prNumber}/comments`,
          {
            method: "POST",
            body: { body: bodyMd },
          }
        );
        logger?.debug("Posted Gitee PR conversation comment", {
          fullName,
          prNumber,
          commentId: data.id,
        });
        return mapPostedComment(data);
      },
      PROVIDER,
      logger,
      context({ operation: "postPullRequestComment", repository: fullName })
    );
  }

  async getRepositoryFile(
    fullName: string,
    path: string,
    ref: string,
    credential: ProviderCredential,
    logger?: Logger
  ): Promise<string | null> {
    const cred = assertGitee(credential);
    const { owner, repo } = splitFullName(fullName);
    const client = getGiteePatClient(cred);
    return withGitPlatformErrorBoundary(
      async () => {
        try {
          const encodedPath = path
            .split("/")
            .map((seg) => encodeURIComponent(seg))
            .join("/");
          const data = await client.request<{
            type?: string;
            encoding?: string;
            content?: string;
          }>(
            `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${encodedPath}`,
            { query: { ref } }
          );
          if (!data || data.type !== "file" || typeof data.content !== "string") {
            return null;
          }
          const buf = Buffer.from(data.content, "base64");
          const text = buf.toString("utf-8");
          logger?.debug("Fetched Gitee repository file", {
            fullName,
            path,
            ref,
            bytes: buf.length,
          });
          return text;
        } catch (err) {
          if (
            typeof err === "object" &&
            err !== null &&
            "status" in err &&
            (err as { status?: number }).status === 404
          ) {
            return null;
          }
          throw err;
        }
      },
      PROVIDER,
      logger,
      context({ operation: "getRepositoryFile", fullName, path, ref })
    );
  }

  async normalizeWebhookEvent(
    rawHeaders: Record<string, string>,
    rawBody: string,
    webhookSecret: string
  ): Promise<NormalizedWebhookEvent> {
    return normalizeGiteeEvent(rawHeaders, rawBody, webhookSecret);
  }
}
