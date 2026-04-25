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
import { GitProviderNotImplementedError } from "../errors.js";

export class GitLabProvider implements IProvider {
  readonly provider = "gitlab" as const;

  getInstallation(
    _installationId: string,
    _credential: ProviderCredential
  ): Promise<Installation> {
    return Promise.reject(new GitProviderNotImplementedError("gitlab", "getInstallation"));
  }

  listRepositories(
    _credential: ProviderCredential,
    _options?: ListRepositoriesOptions
  ): Promise<ProviderRepository[]> {
    return Promise.reject(new GitProviderNotImplementedError("gitlab", "listRepositories"));
  }

  getRepository(
    _fullName: string,
    _credential: ProviderCredential
  ): Promise<ProviderRepository> {
    return Promise.reject(new GitProviderNotImplementedError("gitlab", "getRepository"));
  }

  listPullRequests(
    _fullName: string,
    _credential: ProviderCredential,
    _options?: ListPullRequestsOptions
  ): Promise<ProviderPullRequest[]> {
    return Promise.reject(new GitProviderNotImplementedError("gitlab", "listPullRequests"));
  }

  getPullRequest(
    _fullName: string,
    _prNumber: number,
    _credential: ProviderCredential
  ): Promise<ProviderPullRequest> {
    return Promise.reject(new GitProviderNotImplementedError("gitlab", "getPullRequest"));
  }

  getPullRequestDiff(
    _fullName: string,
    _prNumber: number,
    _credential: ProviderCredential
  ): Promise<FileDiff[]> {
    return Promise.reject(new GitProviderNotImplementedError("gitlab", "getPullRequestDiff"));
  }

  postReviewComment(
    _fullName: string,
    _input: ReviewCommentInput,
    _credential: ProviderCredential
  ): Promise<PostedComment> {
    return Promise.reject(new GitProviderNotImplementedError("gitlab", "postReviewComment"));
  }

  postPullRequestComment(
    _fullName: string,
    _prNumber: number,
    _bodyMd: string,
    _credential: ProviderCredential
  ): Promise<PostedComment> {
    return Promise.reject(
      new GitProviderNotImplementedError("gitlab", "postPullRequestComment")
    );
  }

  normalizeWebhookEvent(
    _rawHeaders: Record<string, string>,
    _rawBody: string,
    _webhookSecret: string
  ): Promise<NormalizedWebhookEvent> {
    return Promise.reject(new GitProviderNotImplementedError("gitlab", "normalizeWebhookEvent"));
  }
}
