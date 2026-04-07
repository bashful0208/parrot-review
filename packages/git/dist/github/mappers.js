const FILE_STATUS_MAP = {
    added: "added",
    removed: "removed",
    modified: "modified",
    renamed: "renamed",
    copied: "copied",
    changed: "modified",
};
export function mapRepository(repo) {
    return {
        providerRepoId: String(repo.id),
        name: repo.name,
        fullName: repo.full_name,
        ownerNamespace: repo.owner.login,
        defaultBranch: repo.default_branch,
        isPrivate: repo.private,
        htmlUrl: repo.html_url,
        cloneUrl: repo.clone_url,
        description: repo.description,
        pushedAt: repo.pushed_at != null ? new Date(repo.pushed_at) : null,
    };
}
export function mapPullRequest(pr) {
    const state = pr.merged_at != null ? "merged" : pr.state === "open" ? "open" : "closed";
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
export function mapFileDiff(file) {
    const isBinary = file.patch == null && file.sha !== "0000000000000000000000000000000000000000";
    return {
        filePath: file.filename,
        previousPath: file.previous_filename ?? null,
        changeType: FILE_STATUS_MAP[file.status] ?? "modified",
        additions: file.additions,
        deletions: file.deletions,
        isBinary,
        patch: file.patch ?? null,
    };
}
export function mapPostedComment(comment) {
    return {
        externalCommentId: String(comment.id),
        htmlUrl: comment.html_url,
        createdAt: new Date(comment.created_at),
    };
}
