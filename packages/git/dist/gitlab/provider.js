import { GitProviderNotImplementedError } from "../errors.js";
export class GitLabProvider {
    provider = "gitlab";
    getInstallation(_installationId, _credential) {
        return Promise.reject(new GitProviderNotImplementedError("gitlab", "getInstallation"));
    }
    listRepositories(_credential, _options) {
        return Promise.reject(new GitProviderNotImplementedError("gitlab", "listRepositories"));
    }
    getRepository(_fullName, _credential) {
        return Promise.reject(new GitProviderNotImplementedError("gitlab", "getRepository"));
    }
    listPullRequests(_fullName, _credential, _options) {
        return Promise.reject(new GitProviderNotImplementedError("gitlab", "listPullRequests"));
    }
    getPullRequest(_fullName, _prNumber, _credential) {
        return Promise.reject(new GitProviderNotImplementedError("gitlab", "getPullRequest"));
    }
    getPullRequestDiff(_fullName, _prNumber, _credential) {
        return Promise.reject(new GitProviderNotImplementedError("gitlab", "getPullRequestDiff"));
    }
    compareCommits(_fullName, _base, _head, _credential) {
        return Promise.reject(new GitProviderNotImplementedError("gitlab", "compareCommits"));
    }
    postReviewComment(_fullName, _input, _credential) {
        return Promise.reject(new GitProviderNotImplementedError("gitlab", "postReviewComment"));
    }
    postPullRequestComment(_fullName, _prNumber, _bodyMd, _credential) {
        return Promise.reject(new GitProviderNotImplementedError("gitlab", "postPullRequestComment"));
    }
    async getRepositoryFile(_fullName, _path, _ref, _credential, _logger) {
        throw new Error("GitLabProvider.getRepositoryFile is not implemented");
    }
    normalizeWebhookEvent(_rawHeaders, _rawBody, _webhookSecret) {
        return Promise.reject(new GitProviderNotImplementedError("gitlab", "normalizeWebhookEvent"));
    }
}
