import { App } from "@octokit/app";
import { Octokit } from "@octokit/rest";
const appCache = new Map();
function getOrCreateApp(cred) {
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
export async function getInstallationOctokit(cred) {
    const app = getOrCreateApp(cred);
    return app.getInstallationOctokit(Number(cred.installationId));
}
export function getPatOctokit(cred) {
    return new Octokit({ auth: cred.token });
}
