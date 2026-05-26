import type { Logger } from "@reviewer/core";
import type { FileDiff, Installation, PostedComment, ProviderPullRequest, ProviderRepository, ReviewCommentInput } from "../domain/models.js";
import type { NormalizedWebhookEvent } from "../domain/webhook.js";
import type { ProviderCredential } from "../credentials.js";
import type { IProvider, ListPullRequestsOptions, ListRepositoriesOptions } from "../provider.js";
export declare class GitHubProvider implements IProvider {
    readonly provider: "github";
    getInstallation(installationId: string, credential: ProviderCredential, logger?: Logger): Promise<Installation>;
    listRepositories(credential: ProviderCredential, options?: ListRepositoriesOptions, logger?: Logger): Promise<ProviderRepository[]>;
    getRepository(fullName: string, credential: ProviderCredential, logger?: Logger): Promise<ProviderRepository>;
    listPullRequests(fullName: string, credential: ProviderCredential, options?: ListPullRequestsOptions, logger?: Logger): Promise<ProviderPullRequest[]>;
    getPullRequest(fullName: string, prNumber: number, credential: ProviderCredential, logger?: Logger): Promise<ProviderPullRequest>;
    getPullRequestDiff(fullName: string, prNumber: number, credential: ProviderCredential, logger?: Logger): Promise<FileDiff[]>;
    compareCommits(fullName: string, base: string, head: string, credential: ProviderCredential, logger?: Logger): Promise<FileDiff[]>;
    postReviewComment(fullName: string, input: ReviewCommentInput, credential: ProviderCredential, logger?: Logger): Promise<PostedComment>;
    postPullRequestComment(fullName: string, prNumber: number, bodyMd: string, credential: ProviderCredential, logger?: Logger): Promise<PostedComment>;
    getRepositoryFile(fullName: string, path: string, ref: string, credential: ProviderCredential, logger?: Logger): Promise<string | null>;
    normalizeWebhookEvent(rawHeaders: Record<string, string>, rawBody: string, webhookSecret: string): Promise<NormalizedWebhookEvent>;
}
