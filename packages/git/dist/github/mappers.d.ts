import type { FileDiff, PostedComment, ProviderPullRequest, ProviderRepository } from "../domain/models.js";
type OctokitRepo = {
    id: number;
    name: string;
    full_name: string;
    owner: {
        login: string;
    };
    default_branch: string;
    private: boolean;
    html_url: string;
    clone_url: string;
    description: string | null;
    pushed_at: string | null;
};
type OctokitPR = {
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
type OctokitFile = {
    filename: string;
    previous_filename?: string;
    status: string;
    additions: number;
    deletions: number;
    patch?: string;
    sha: string;
};
type OctokitComment = {
    id: number;
    html_url: string;
    created_at: string;
};
export declare function mapRepository(repo: OctokitRepo): ProviderRepository;
export declare function mapPullRequest(pr: OctokitPR): ProviderPullRequest;
export declare function mapFileDiff(file: OctokitFile): FileDiff;
export declare function mapPostedComment(comment: OctokitComment): PostedComment;
export {};
