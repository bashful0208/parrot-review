import type { GitProvider } from "@reviewer/db-types";
import type { Logger } from "@reviewer/core";
import type {
  Installation,
  ProviderRepository,
  ProviderPullRequest,
  FileDiff,
  ReviewCommentInput,
  PostedComment,
} from "./domain/models.js";
import type { NormalizedWebhookEvent } from "./domain/webhook.js";
import type { ProviderCredential } from "./credentials.js";

export interface ListRepositoriesOptions {
  page?: number;
  perPage?: number;
}

export interface ListPullRequestsOptions {
  state?: "open" | "closed" | "all";
  page?: number;
  perPage?: number;
}

/**
 * 统一 Git 平台 provider 接口。
 *
 * 凭证约定：credential 是已解密的凭证对象，由调用方从 vault 解析后传入；
 * provider 实现不负责凭证加载，只负责使用凭证构建 API 客户端。
 *
 * 限流约定：遭遇限流时实现必须抛出 GitPlatformRateLimitError，
 * 调用方通过 withGitPlatformErrorBoundary() 统一捕获并触发退避重试。
 */
export interface IProvider {
  readonly provider: GitProvider;

  getInstallation(
    installationId: string,
    credential: ProviderCredential,
    logger?: Logger
  ): Promise<Installation>;

  listRepositories(
    credential: ProviderCredential,
    options?: ListRepositoriesOptions,
    logger?: Logger
  ): Promise<ProviderRepository[]>;

  getRepository(
    fullName: string,
    credential: ProviderCredential,
    logger?: Logger
  ): Promise<ProviderRepository>;

  listPullRequests(
    fullName: string,
    credential: ProviderCredential,
    options?: ListPullRequestsOptions,
    logger?: Logger
  ): Promise<ProviderPullRequest[]>;

  getPullRequest(
    fullName: string,
    prNumber: number,
    credential: ProviderCredential,
    logger?: Logger
  ): Promise<ProviderPullRequest>;

  getPullRequestDiff(
    fullName: string,
    prNumber: number,
    credential: ProviderCredential,
    logger?: Logger
  ): Promise<FileDiff[]>;

  /**
   * 取 base..head 两个 commit 之间的文件 diff，用于增量审查。
   * 返回结构与 getPullRequestDiff 对齐。
   */
  compareCommits(
    fullName: string,
    base: string,
    head: string,
    credential: ProviderCredential,
    logger?: Logger
  ): Promise<FileDiff[]>;

  postReviewComment(
    fullName: string,
    input: ReviewCommentInput,
    credential: ProviderCredential,
    logger?: Logger
  ): Promise<PostedComment>;

  /**
   * 在 PR 的 conversation 区发一条整体评论（非行级），
   * 通常用于回写 PR 摘要。
   */
  postPullRequestComment(
    fullName: string,
    prNumber: number,
    bodyMd: string,
    credential: ProviderCredential,
    logger?: Logger
  ): Promise<PostedComment>;

  normalizeWebhookEvent(
    rawHeaders: Record<string, string>,
    rawBody: string,
    webhookSecret: string
  ): Promise<NormalizedWebhookEvent>;

  /**
   * 读取目标仓库某个文件的 utf-8 内容。
   *
   * - 返回 null 表示文件不存在 (404)，**不抛**。
   * - 其他错误（401/403/5xx/网络）按平台错误处理（withGitPlatformErrorBoundary）抛出。
   * - 调用方负责按字符截断和缓存策略。
   */
  getRepositoryFile(
    fullName: string,
    path: string,
    ref: string,
    credential: ProviderCredential,
    logger?: Logger
  ): Promise<string | null>;
}
