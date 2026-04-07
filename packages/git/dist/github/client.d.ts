import { Octokit } from "@octokit/rest";
import type { GitHubAppCredential, GitHubPatCredential } from "../credentials.js";
export declare function getInstallationOctokit(cred: GitHubAppCredential): Promise<Octokit>;
export declare function getPatOctokit(cred: GitHubPatCredential): Octokit;
