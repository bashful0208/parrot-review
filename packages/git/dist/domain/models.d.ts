import type { GitProvider } from "@reviewer/db-types";
export interface Installation {
    installationId: string;
    provider: GitProvider;
    providerOwnerId: string;
    organizationId: string;
    repositoryId: string;
}
export interface ProviderRepository {
    providerRepoId: string;
    name: string;
    fullName: string;
    ownerNamespace: string;
    defaultBranch: string;
    isPrivate: boolean;
    htmlUrl: string;
    cloneUrl: string;
    description: string | null;
    pushedAt: Date | null;
}
export interface ProviderPullRequest {
    providerPrId: string;
    providerPrNumber: number;
    title: string;
    description: string | null;
    authorLogin: string;
    baseBranch: string;
    headBranch: string;
    baseSha: string;
    headSha: string;
    state: "open" | "closed" | "merged";
    openedAt: Date;
    closedAt: Date | null;
    mergedAt: Date | null;
    htmlUrl: string;
}
export type FileDiffChangeType = "added" | "removed" | "modified" | "renamed" | "copied";
export interface FileDiff {
    filePath: string;
    previousPath: string | null;
    changeType: FileDiffChangeType;
    additions: number;
    deletions: number;
    isBinary: boolean;
    patch: string | null;
}
export interface ReviewCommentInput {
    prNumber: number;
    commitSha: string;
    filePath: string;
    line: number;
    side: "LEFT" | "RIGHT";
    bodyMd: string;
    /** Unified-diff patch for the target file. Required by providers that
     * use diff position (e.g. Gitee); ignored by providers that take file
     * line directly (e.g. GitHub). */
    patch?: string | null;
}
export interface PostedComment {
    externalCommentId: string;
    htmlUrl: string;
    createdAt: Date;
}
