export interface GitHubAppCredential {
  type: "github_app";
  appId: number;
  privateKeyPem: string;
  installationId: string;
}

export interface GitHubPatCredential {
  type: "github_pat";
  token: string;
}

export type GitHubCredential = GitHubAppCredential | GitHubPatCredential;

export interface GitLabPatCredential {
  type: "gitlab_pat";
  token: string;
  baseUrl?: string;
}

export interface GiteePatCredential {
  type: "gitee_pat";
  token: string;
}

export type ProviderCredential =
  | GitHubCredential
  | GitLabPatCredential
  | GiteePatCredential;
