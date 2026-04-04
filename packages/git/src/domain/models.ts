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

export type FileDiffChangeType =
  | "added"
  | "removed"
  | "modified"
  | "renamed"
  | "copied";

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
}

export interface PostedComment {
  externalCommentId: string;
  htmlUrl: string;
  createdAt: Date;
}
