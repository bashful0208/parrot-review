import type { FileDiff, Installation, PostedComment, ProviderPullRequest, ProviderRepository, ReviewCommentInput } from "../domain/models.js";
import type { NormalizedWebhookEvent } from "../domain/webhook.js";
import type { ProviderCredential } from "../credentials.js";
import type { IProvider, ListPullRequestsOptions, ListRepositoriesOptions } from "../provider.js";
export declare class GitLabProvider implements IProvider {
    readonly provider: "gitlab";
    getInstallation(_installationId: string, _credential: ProviderCredential): Promise<Installation>;
    listRepositories(_credential: ProviderCredential, _options?: ListRepositoriesOptions): Promise<ProviderRepository[]>;
    getRepository(_fullName: string, _credential: ProviderCredential): Promise<ProviderRepository>;
    listPullRequests(_fullName: string, _credential: ProviderCredential, _options?: ListPullRequestsOptions): Promise<ProviderPullRequest[]>;
    getPullRequest(_fullName: string, _prNumber: number, _credential: ProviderCredential): Promise<ProviderPullRequest>;
    getPullRequestDiff(_fullName: string, _prNumber: number, _credential: ProviderCredential): Promise<FileDiff[]>;
    compareCommits(_fullName: string, _base: string, _head: string, _credential: ProviderCredential): Promise<FileDiff[]>;
    postReviewComment(_fullName: string, _input: ReviewCommentInput, _credential: ProviderCredential): Promise<PostedComment>;
    postPullRequestComment(_fullName: string, _prNumber: number, _bodyMd: string, _credential: ProviderCredential): Promise<PostedComment>;
    getRepositoryFile(_fullName: string, _path: string, _ref: string, _credential: ProviderCredential, _logger?: unknown): Promise<string | null>;
    normalizeWebhookEvent(_rawHeaders: Record<string, string>, _rawBody: string, _webhookSecret: string): Promise<NormalizedWebhookEvent>;
}
