import { GitProviderNotImplementedError } from "../errors.js";
export class GiteeProvider {
    provider = "gitee";
    getInstallation(_installationId, _credential) {
        return Promise.reject(new GitProviderNotImplementedError("gitee", "getInstallation"));
    }
    listRepositories(_credential, _options) {
        return Promise.reject(new GitProviderNotImplementedError("gitee", "listRepositories"));
    }
    getRepository(_fullName, _credential) {
        return Promise.reject(new GitProviderNotImplementedError("gitee", "getRepository"));
    }
    listPullRequests(_fullName, _credential, _options) {
        return Promise.reject(new GitProviderNotImplementedError("gitee", "listPullRequests"));
    }
    getPullRequest(_fullName, _prNumber, _credential) {
        return Promise.reject(new GitProviderNotImplementedError("gitee", "getPullRequest"));
    }
    getPullRequestDiff(_fullName, _prNumber, _credential) {
        return Promise.reject(new GitProviderNotImplementedError("gitee", "getPullRequestDiff"));
    }
    postReviewComment(_fullName, _input, _credential) {
        return Promise.reject(new GitProviderNotImplementedError("gitee", "postReviewComment"));
    }
    normalizeWebhookEvent(_rawHeaders, _rawBody, _webhookSecret) {
        return Promise.reject(new GitProviderNotImplementedError("gitee", "normalizeWebhookEvent"));
    }
}
