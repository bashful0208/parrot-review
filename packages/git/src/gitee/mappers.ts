import type {
  FileDiff,
  FileDiffChangeType,
  PostedComment,
  ProviderPullRequest,
  ProviderRepository,
} from "../domain/models.js";

export type GiteeRepo = {
  id: number;
  name: string;
  full_name: string;
  human_name?: string;
  namespace?: { path: string; name: string };
  owner?: { login: string; name?: string };
  default_branch: string;
  private: boolean;
  html_url: string;
  ssh_url?: string;
  description: string | null;
  pushed_at: string | null;
};

export type GiteePR = {
  id: number;
  number: number;
  title: string;
  body: string | null;
  user: { login: string } | null;
  base: { ref: string; sha: string };
  head: { ref: string; sha: string };
  state: string;
  merged_at: string | null;
  closed_at: string | null;
  created_at: string;
  html_url: string;
};

export type GiteeFile = {
  filename: string;
  status: string;
  additions?: number;
  deletions?: number;
  patch?: string | { diff?: string };
  sha?: string;
};

export type GiteeComment = {
  id: number;
  html_url?: string;
  created_at: string;
};

const FILE_STATUS_MAP: Record<string, FileDiffChangeType> = {
  added: "added",
  removed: "removed",
  deleted: "removed",
  modified: "modified",
  renamed: "renamed",
  copied: "copied",
  changed: "modified",
};

export function mapRepository(repo: GiteeRepo): ProviderRepository {
  const ownerNamespace =
    repo.namespace?.path ?? repo.owner?.login ?? repo.full_name.split("/")[0] ?? "";
  return {
    providerRepoId: String(repo.id),
    name: repo.name,
    fullName: repo.full_name,
    ownerNamespace,
    defaultBranch: repo.default_branch,
    isPrivate: repo.private,
    htmlUrl: repo.html_url,
    cloneUrl: repo.ssh_url ?? repo.html_url,
    description: repo.description,
    pushedAt: repo.pushed_at != null ? new Date(repo.pushed_at) : null,
  };
}

export function mapPullRequest(pr: GiteePR): ProviderPullRequest {
  const state: ProviderPullRequest["state"] =
    pr.merged_at != null ? "merged" : pr.state === "open" ? "open" : "closed";

  return {
    providerPrId: String(pr.id),
    providerPrNumber: pr.number,
    title: pr.title,
    description: pr.body,
    authorLogin: pr.user?.login ?? "",
    baseBranch: pr.base.ref,
    headBranch: pr.head.ref,
    baseSha: pr.base.sha,
    headSha: pr.head.sha,
    state,
    openedAt: new Date(pr.created_at),
    closedAt: pr.closed_at != null ? new Date(pr.closed_at) : null,
    mergedAt: pr.merged_at != null ? new Date(pr.merged_at) : null,
    htmlUrl: pr.html_url,
  };
}

export function mapFileDiff(file: GiteeFile): FileDiff {
  const patchText =
    typeof file.patch === "string"
      ? file.patch
      : (file.patch?.diff ?? null);
  const isBinary = patchText == null && (file.additions ?? 0) === 0 && (file.deletions ?? 0) === 0;
  return {
    filePath: file.filename,
    previousPath: null,
    changeType: FILE_STATUS_MAP[file.status] ?? "modified",
    additions: file.additions ?? 0,
    deletions: file.deletions ?? 0,
    isBinary,
    patch: patchText,
  };
}

export function mapPostedComment(comment: GiteeComment): PostedComment {
  return {
    externalCommentId: String(comment.id),
    htmlUrl: comment.html_url ?? "",
    createdAt: new Date(comment.created_at),
  };
}
