import { App } from "@octokit/app";
import { Octokit } from "@octokit/rest";
import type { GitHubAppCredential, GitHubPatCredential } from "../credentials.js";

const appCache = new Map<number, App>();

function getOrCreateApp(cred: GitHubAppCredential): App {
  let app = appCache.get(cred.appId);
  if (!app) {
    app = new App({
      appId: cred.appId,
      privateKey: cred.privateKeyPem,
    });
    appCache.set(cred.appId, app);
  }
  return app;
}

export async function getInstallationOctokit(cred: GitHubAppCredential): Promise<Octokit> {
  const app = getOrCreateApp(cred);
  return app.getInstallationOctokit(Number(cred.installationId)) as Promise<Octokit>;
}

export function getPatOctokit(cred: GitHubPatCredential): Octokit {
  return new Octokit({ auth: cred.token });
}
