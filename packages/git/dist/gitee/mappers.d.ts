import type { FileDiff, PostedComment, ProviderPullRequest, ProviderRepository } from "../domain/models.js";
export type GiteeRepo = {
    id: number;
    name: string;
    full_name: string;
    human_name?: string;
    namespace?: {
        path: string;
        name: string;
    };
    owner?: {
        login: string;
        name?: string;
    };
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
    user: {
        login: string;
    } | null;
    base: {
        ref: string;
        sha: string;
    };
    head: {
        ref: string;
        sha: string;
    };
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
    patch?: string | {
        diff?: string;
    };
    sha?: string;
};
export type GiteeComment = {
    id: number;
    html_url?: string;
    created_at: string;
};
export declare function mapRepository(repo: GiteeRepo): ProviderRepository;
export declare function mapPullRequest(pr: GiteePR): ProviderPullRequest;
export declare function mapFileDiff(file: GiteeFile): FileDiff;
export declare function mapPostedComment(comment: GiteeComment): PostedComment;
