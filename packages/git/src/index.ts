// domain types
export type {
  Installation,
  ProviderRepository,
  ProviderPullRequest,
  FileDiff,
  FileDiffChangeType,
  ReviewCommentInput,
  PostedComment,
} from "./domain/models.js";
export type { NormalizedWebhookEvent } from "./domain/webhook.js";

// credentials
export type {
  ProviderCredential,
  GitHubCredential,
  GitHubAppCredential,
  GitHubPatCredential,
  GitLabPatCredential,
  GiteePatCredential,
} from "./credentials.js";

// provider interface
export type {
  IProvider,
  ListRepositoriesOptions,
  ListPullRequestsOptions,
} from "./provider.js";

// errors
export {
  GitPlatformApiError,
  GitPlatformRateLimitError,
  GitPlatformAuthError,
  GitWebhookSignatureError,
  GitProviderNotImplementedError,
  withGitPlatformErrorBoundary,
} from "./errors.js";

// GitHub provider
export { GitHubProvider } from "./github/provider.js";
export { verifyGitHubWebhookSignature } from "./github/webhook.js";

// Stubs
export { GitLabProvider } from "./gitlab/provider.js";
export { GiteeProvider } from "./gitee/provider.js";
