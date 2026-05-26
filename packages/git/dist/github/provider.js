import { withGitPlatformErrorBoundary } from "../errors.js";
import { getInstallationOctokit, getPatOctokit } from "./client.js";
import { mapFileDiff, mapPostedComment, mapPullRequest, mapRepository, } from "./mappers.js";
import { normalizeGitHubEvent } from "./webhook.js";
const PROVIDER = "github";
function assertGitHub(credential) {
    if (credential.type !== "github_app" &&
        credential.type !== "github_pat") {
        throw new TypeError(`GitHubProvider requires github_app or github_pat credential, got: ${credential.type}`);
    }
    return credential;
}
async function buildOctokit(credential) {
    const cred = assertGitHub(credential);
    if (cred.type === "github_app") {
        return getInstallationOctokit(cred);
    }
    return getPatOctokit(cred);
}
function context(extra) {
    return { provider: PROVIDER, ...extra };
}
export class GitHubProvider {
    provider = PROVIDER;
    async getInstallation(installationId, credential, logger) {
        const octokit = await buildOctokit(credential);
        return withGitPlatformErrorBoundary(async () => {
            const { data } = await octokit.request("GET /app/installations/{installation_id}", { installation_id: Number(installationId) });
            logger?.debug("Fetched GitHub installation", { installationId });
            return {
                installationId,
                provider: PROVIDER,
                providerOwnerId: String(data.account?.id ?? ""),
                organizationId: "",
                repositoryId: "",
            };
        }, PROVIDER, logger, context({ operation: "getInstallation", installationId }));
    }
    async listRepositories(credential, options, logger) {
        const octokit = await buildOctokit(credential);
        return withGitPlatformErrorBoundary(async () => {
            if (credential.type === "github_pat") {
                const { data } = await octokit.request("GET /user/repos", {
                    type: "all",
                    sort: "updated",
                    per_page: options?.perPage ?? 30,
                    page: options?.page ?? 1,
                });
                logger?.debug("Listed GitHub repositories (PAT)", { count: data.length });
                return data.map(mapRepository);
            }
            const { data } = await octokit.request("GET /installation/repositories", {
                per_page: options?.perPage ?? 30,
                page: options?.page ?? 1,
            });
            logger?.debug("Listed GitHub repositories (App)", {
                count: data.repositories.length,
            });
            return data.repositories.map(mapRepository);
        }, PROVIDER, logger, context({ operation: "listRepositories" }));
    }
    async getRepository(fullName, credential, logger) {
        const [owner, repo] = fullName.split("/");
        const octokit = await buildOctokit(credential);
        return withGitPlatformErrorBoundary(async () => {
            const { data } = await octokit.request("GET /repos/{owner}/{repo}", { owner, repo });
            logger?.debug("Fetched GitHub repository", { fullName });
            return mapRepository(data);
        }, PROVIDER, logger, context({ operation: "getRepository", repository: fullName }));
    }
    async listPullRequests(fullName, credential, options, logger) {
        const [owner, repo] = fullName.split("/");
        const octokit = await buildOctokit(credential);
        return withGitPlatformErrorBoundary(async () => {
            const { data } = await octokit.request("GET /repos/{owner}/{repo}/pulls", {
                owner,
                repo,
                state: options?.state ?? "open",
                per_page: options?.perPage ?? 30,
                page: options?.page ?? 1,
            });
            logger?.debug("Listed GitHub pull requests", {
                fullName,
                count: data.length,
            });
            return data.map(mapPullRequest);
        }, PROVIDER, logger, context({ operation: "listPullRequests", repository: fullName }));
    }
    async getPullRequest(fullName, prNumber, credential, logger) {
        const [owner, repo] = fullName.split("/");
        const octokit = await buildOctokit(credential);
        return withGitPlatformErrorBoundary(async () => {
            const { data } = await octokit.request("GET /repos/{owner}/{repo}/pulls/{pull_number}", { owner, repo, pull_number: prNumber });
            logger?.debug("Fetched GitHub pull request", { fullName, prNumber });
            return mapPullRequest(data);
        }, PROVIDER, logger, context({ operation: "getPullRequest", repository: fullName }));
    }
    async getPullRequestDiff(fullName, prNumber, credential, logger) {
        const [owner, repo] = fullName.split("/");
        const octokit = await buildOctokit(credential);
        return withGitPlatformErrorBoundary(async () => {
            const { data } = await octokit.request("GET /repos/{owner}/{repo}/pulls/{pull_number}/files", { owner, repo, pull_number: prNumber, per_page: 100 });
            logger?.debug("Fetched GitHub PR diff", {
                fullName,
                prNumber,
                fileCount: data.length,
            });
            return data.map(mapFileDiff);
        }, PROVIDER, logger, context({ operation: "getPullRequestDiff", repository: fullName }));
    }
    async compareCommits(fullName, base, head, credential, logger) {
        const [owner, repo] = fullName.split("/");
        const octokit = await buildOctokit(credential);
        return withGitPlatformErrorBoundary(async () => {
            const { data } = await octokit.request("GET /repos/{owner}/{repo}/compare/{basehead}", { owner, repo, basehead: `${base}...${head}`, per_page: 100 });
            const files = data.files ?? [];
            logger?.debug("Fetched GitHub compare diff", {
                fullName,
                base,
                head,
                fileCount: files.length,
            });
            return files.map(mapFileDiff);
        }, PROVIDER, logger, context({ operation: "compareCommits", repository: fullName }));
    }
    async postReviewComment(fullName, input, credential, logger) {
        const [owner, repo] = fullName.split("/");
        const octokit = await buildOctokit(credential);
        return withGitPlatformErrorBoundary(async () => {
            const { data } = await octokit.request("POST /repos/{owner}/{repo}/pulls/{pull_number}/comments", {
                owner,
                repo,
                pull_number: input.prNumber,
                commit_id: input.commitSha,
                path: input.filePath,
                line: input.line,
                side: input.side,
                body: input.bodyMd,
            });
            logger?.debug("Posted GitHub review comment", {
                fullName,
                prNumber: input.prNumber,
                commentId: data.id,
            });
            return mapPostedComment(data);
        }, PROVIDER, logger, context({ operation: "postReviewComment", repository: fullName }));
    }
    async postPullRequestComment(fullName, prNumber, bodyMd, credential, logger) {
        const [owner, repo] = fullName.split("/");
        const octokit = await buildOctokit(credential);
        return withGitPlatformErrorBoundary(async () => {
            const { data } = await octokit.request("POST /repos/{owner}/{repo}/issues/{issue_number}/comments", {
                owner,
                repo,
                issue_number: prNumber,
                body: bodyMd,
            });
            logger?.debug("Posted GitHub PR conversation comment", {
                fullName,
                prNumber,
                commentId: data.id,
            });
            return mapPostedComment(data);
        }, PROVIDER, logger, context({ operation: "postPullRequestComment", repository: fullName }));
    }
    async getRepositoryFile(fullName, path, ref, credential, logger) {
        const [owner, repo] = fullName.split("/");
        if (!owner || !repo) {
            throw new Error(`Invalid GitHub repository full_name: ${fullName}`);
        }
        const octokit = await buildOctokit(credential);
        return withGitPlatformErrorBoundary(async () => {
            try {
                const { data } = await octokit.request("GET /repos/{owner}/{repo}/contents/{path}", { owner, repo, path, ref });
                if (Array.isArray(data) || !("content" in data) || data.type !== "file") {
                    return null;
                }
                const buf = Buffer.from(data.content, "base64");
                const text = buf.toString("utf-8");
                logger?.debug("Fetched GitHub repository file", {
                    fullName,
                    path,
                    ref,
                    bytes: buf.length,
                });
                return text;
            }
            catch (err) {
                if (typeof err === "object" &&
                    err !== null &&
                    "status" in err &&
                    err.status === 404) {
                    return null;
                }
                throw err;
            }
        }, PROVIDER, logger, context({ operation: "getRepositoryFile", fullName, path, ref }));
    }
    async normalizeWebhookEvent(rawHeaders, rawBody, webhookSecret) {
        return normalizeGitHubEvent(rawHeaders, rawBody, webhookSecret);
    }
}
