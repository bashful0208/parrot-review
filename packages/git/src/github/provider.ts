import type { Logger } from "@reviewer/core";
import type { ErrorContext } from "@reviewer/core";
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
import { getInstallationOctokit, getPatOctokit } from "./client.js";
import {
  mapFileDiff,
  mapPostedComment,
  mapPullRequest,
  mapRepository,
} from "./mappers.js";
import { normalizeGitHubEvent } from "./webhook.js";

const PROVIDER = "github" as const;

function assertGitHub(credential: ProviderCredential) {
  if (
    credential.type !== "github_app" &&
    credential.type !== "github_pat"
  ) {
    throw new TypeError(
      `GitHubProvider requires github_app or github_pat credential, got: ${credential.type}`
    );
  }
  return credential;
}

async function buildOctokit(credential: ProviderCredential) {
  const cred = assertGitHub(credential);
  if (cred.type === "github_app") {
    return getInstallationOctokit(cred);
  }
  return getPatOctokit(cred);
}

function context(extra?: Record<string, unknown>): ErrorContext {
  return { provider: PROVIDER, ...extra };
}

export class GitHubProvider implements IProvider {
  readonly provider = PROVIDER;

  async getInstallation(
    installationId: string,
    credential: ProviderCredential,
    logger?: Logger
  ): Promise<Installation> {
    const octokit = await buildOctokit(credential);
    return withGitPlatformErrorBoundary(
      async () => {
        const { data } = await (octokit as Awaited<ReturnType<typeof getPatOctokit>>).request(
          "GET /app/installations/{installation_id}",
          { installation_id: Number(installationId) }
        );
        logger?.debug("Fetched GitHub installation", { installationId });
        return {
          installationId,
          provider: PROVIDER,
          providerOwnerId: String(data.account?.id ?? ""),
          organizationId: "",
          repositoryId: "",
        };
      },
      PROVIDER,
      logger,
      context({ operation: "getInstallation", installationId })
    );
  }

  async listRepositories(
    credential: ProviderCredential,
    options?: ListRepositoriesOptions,
    logger?: Logger
  ): Promise<ProviderRepository[]> {
    const octokit = await buildOctokit(credential);
    return withGitPlatformErrorBoundary(
      async () => {
        const { data } = await (octokit as Awaited<ReturnType<typeof getPatOctokit>>).request(
          "GET /installation/repositories",
          {
            per_page: options?.perPage ?? 30,
            page: options?.page ?? 1,
          }
        );
        logger?.debug("Listed GitHub repositories", {
          count: data.repositories.length,
        });
        return data.repositories.map(mapRepository);
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
    const [owner, repo] = fullName.split("/");
    const octokit = await buildOctokit(credential);
    return withGitPlatformErrorBoundary(
      async () => {
        const { data } = await (octokit as Awaited<ReturnType<typeof getPatOctokit>>).request(
          "GET /repos/{owner}/{repo}",
          { owner, repo }
        );
        logger?.debug("Fetched GitHub repository", { fullName });
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
    const [owner, repo] = fullName.split("/");
    const octokit = await buildOctokit(credential);
    return withGitPlatformErrorBoundary(
      async () => {
        const { data } = await (octokit as Awaited<ReturnType<typeof getPatOctokit>>).request(
          "GET /repos/{owner}/{repo}/pulls",
          {
            owner,
            repo,
            state: options?.state ?? "open",
            per_page: options?.perPage ?? 30,
            page: options?.page ?? 1,
          }
        );
        logger?.debug("Listed GitHub pull requests", {
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
    const [owner, repo] = fullName.split("/");
    const octokit = await buildOctokit(credential);
    return withGitPlatformErrorBoundary(
      async () => {
        const { data } = await (octokit as Awaited<ReturnType<typeof getPatOctokit>>).request(
          "GET /repos/{owner}/{repo}/pulls/{pull_number}",
          { owner, repo, pull_number: prNumber }
        );
        logger?.debug("Fetched GitHub pull request", { fullName, prNumber });
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
    const [owner, repo] = fullName.split("/");
    const octokit = await buildOctokit(credential);
    return withGitPlatformErrorBoundary(
      async () => {
        const { data } = await (octokit as Awaited<ReturnType<typeof getPatOctokit>>).request(
          "GET /repos/{owner}/{repo}/pulls/{pull_number}/files",
          { owner, repo, pull_number: prNumber, per_page: 100 }
        );
        logger?.debug("Fetched GitHub PR diff", {
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

  async postReviewComment(
    fullName: string,
    input: ReviewCommentInput,
    credential: ProviderCredential,
    logger?: Logger
  ): Promise<PostedComment> {
    const [owner, repo] = fullName.split("/");
    const octokit = await buildOctokit(credential);
    return withGitPlatformErrorBoundary(
      async () => {
        const { data } = await (octokit as Awaited<ReturnType<typeof getPatOctokit>>).request(
          "POST /repos/{owner}/{repo}/pulls/{pull_number}/comments",
          {
            owner,
            repo,
            pull_number: input.prNumber,
            commit_id: input.commitSha,
            path: input.filePath,
            line: input.line,
            side: input.side,
            body: input.bodyMd,
          }
        );
        logger?.debug("Posted GitHub review comment", {
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

  async normalizeWebhookEvent(
    rawHeaders: Record<string, string>,
    rawBody: string,
    webhookSecret: string
  ): Promise<NormalizedWebhookEvent> {
    return normalizeGitHubEvent(rawHeaders, rawBody, webhookSecret);
  }
}
