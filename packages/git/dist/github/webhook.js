import { createHmac, timingSafeEqual } from "node:crypto";
export function verifyGitHubWebhookSignature(rawBody, signatureHeader, secret) {
    if (!signatureHeader?.startsWith("sha256=")) {
        return false;
    }
    const digest = createHmac("sha256", secret)
        .update(rawBody, "utf8")
        .digest("hex");
    const expected = Buffer.from(`sha256=${digest}`, "ascii");
    const received = Buffer.from(signatureHeader, "ascii");
    if (expected.length !== received.length) {
        return false;
    }
    return timingSafeEqual(expected, received);
}
const ACTION_TO_TRIGGER = {
    opened: "pr_opened",
    synchronize: "pr_synchronize",
    reopened: "pr_reopened",
};
export function normalizeGitHubEvent(headers, rawBody, webhookSecret) {
    const signatureHeader = headers["x-hub-signature-256"] ?? headers["X-Hub-Signature-256"];
    const signatureValid = verifyGitHubWebhookSignature(rawBody, signatureHeader, webhookSecret);
    const deliveryId = headers["x-github-delivery"] ?? headers["X-GitHub-Delivery"] ?? "";
    const eventType = headers["x-github-event"] ?? headers["X-GitHub-Event"] ?? "";
    const rawPayload = JSON.parse(rawBody);
    const base = {
        provider: "github",
        deliveryId,
        eventType,
        signatureValid,
        rawPayload,
    };
    if (eventType !== "pull_request") {
        return base;
    }
    const action = rawPayload["action"];
    const reviewTrigger = action != null ? ACTION_TO_TRIGGER[action] : undefined;
    const repo = rawPayload["repository"];
    const pr = rawPayload["pull_request"];
    return {
        ...base,
        reviewTrigger,
        providerRepoId: repo != null ? String(repo["id"]) : undefined,
        providerPrNumber: pr != null ? Number(pr["number"]) : undefined,
        headSha: pr?.["head"]?.["sha"],
        baseSha: pr?.["base"]?.["sha"],
    };
}
