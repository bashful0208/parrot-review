import test from "node:test";
import assert from "node:assert/strict";

import type {
  Logger,
  RepoIntegrationLookup,
  WebhookEventRecord,
  WebhookJobPayload,
} from "@reviewer/core";
import type { NormalizedWebhookEvent } from "@reviewer/git";

import { processProviderWebhook, type WebhookProcessDeps } from "./process";

interface Recorder {
  insertCalls: Parameters<WebhookProcessDeps["insertEvent"]>[0][];
  enqueueCalls: WebhookJobPayload[];
  normalizeCalls: { secret: string }[];
  statusCalls: Array<{ id: string; status: string; errorMessage?: string | null }>;
}

function makeLogger(): Logger {
  const noop = (): void => {};
  return {
    info: noop,
    warn: noop,
    error: noop,
    debug: noop,
  } as unknown as Logger;
}

interface BuildOptions {
  repo: RepoIntegrationLookup | null;
  event: NormalizedWebhookEvent;
  insertResult?: WebhookEventRecord | null;
  enqueueShouldThrow?: Error;
}

function buildDeps(opts: BuildOptions): { deps: WebhookProcessDeps; rec: Recorder } {
  const rec: Recorder = {
    insertCalls: [],
    enqueueCalls: [],
    normalizeCalls: [],
    statusCalls: [],
  };
  const insertReturn: WebhookEventRecord | null =
    "insertResult" in opts ? (opts.insertResult ?? null) : { id: "evt-1" };
  const deps: WebhookProcessDeps = {
    findRepoIntegration: async () => opts.repo,
    insertEvent: async (input) => {
      rec.insertCalls.push(input);
      return insertReturn;
    },
    enqueueJob: async (payload) => {
      rec.enqueueCalls.push(payload);
      if (opts.enqueueShouldThrow) throw opts.enqueueShouldThrow;
      return { id: "job-1" };
    },
    normalize: async (_h, _b, secret) => {
      rec.normalizeCalls.push({ secret });
      return opts.event;
    },
    markEventStatus: async (id, status, errorMessage) => {
      rec.statusCalls.push({ id, status, errorMessage });
    },
    logger: makeLogger(),
  };
  return { deps, rec };
}

const VALID_PR_BODY = JSON.stringify({
  action: "opened",
  repository: { id: 9001 },
  pull_request: {
    number: 42,
    head: { sha: "headsha" },
    base: { sha: "basesha" },
  },
});

const REPO: RepoIntegrationLookup = {
  repository_id: "repo-uuid",
  organization_id: "org-uuid",
  installation_id: null,
  webhook_secret: "per-repo-secret",
};

test("processProviderWebhook: unmatched repo records signature_valid=false and skips enqueue", async () => {
  const { deps, rec } = buildDeps({
    repo: null,
    event: {
      provider: "github",
      deliveryId: "d1",
      eventType: "pull_request",
      signatureValid: false,
      rawPayload: { repository: { id: 9001 } },
    },
  });

  const result = await processProviderWebhook("github", VALID_PR_BODY, {}, deps);

  assert.deepEqual(result, { status: 200, body: { ok: true, unmatched: true } });
  assert.equal(rec.insertCalls.length, 1);
  assert.equal(rec.insertCalls[0]!.signatureValid, false);
  assert.equal(rec.insertCalls[0]!.organizationId, null);
  assert.equal(rec.insertCalls[0]!.repositoryId, null);
  assert.equal(rec.enqueueCalls.length, 0);
  assert.equal(rec.normalizeCalls[0]!.secret, "");
  // status: row left at 'unmatched'
  assert.equal(rec.statusCalls.length, 1);
  assert.equal(rec.statusCalls[0]!.status, "unmatched");
});

test("processProviderWebhook: unmatched repo with malformed body still 200 unmatched", async () => {
  const { deps, rec } = buildDeps({
    repo: null,
    event: {
      provider: "gitee",
      deliveryId: "d2",
      eventType: "",
      signatureValid: false,
      rawPayload: {},
    },
  });

  const result = await processProviderWebhook("gitee", "not-json", {}, deps);

  assert.deepEqual(result, { status: 200, body: { ok: true, unmatched: true } });
  assert.equal(rec.insertCalls.length, 1);
  assert.equal(rec.enqueueCalls.length, 0);
});

test("processProviderWebhook: matched repo with invalid signature returns 401 and does not insert", async () => {
  const { deps, rec } = buildDeps({
    repo: REPO,
    event: {
      provider: "github",
      deliveryId: "d3",
      eventType: "pull_request",
      signatureValid: false,
      rawPayload: {},
    },
  });

  const result = await processProviderWebhook("github", VALID_PR_BODY, {}, deps);

  assert.equal(result.status, 401);
  assert.deepEqual(result.body, { ok: false, error: "Invalid signature" });
  assert.equal(rec.insertCalls.length, 0);
  assert.equal(rec.enqueueCalls.length, 0);
  assert.equal(rec.normalizeCalls[0]!.secret, "per-repo-secret");
});

test("processProviderWebhook: matched + valid signature + reviewable trigger inserts and enqueues", async () => {
  const { deps, rec } = buildDeps({
    repo: REPO,
    event: {
      provider: "github",
      deliveryId: "d4",
      eventType: "pull_request",
      signatureValid: true,
      rawPayload: { action: "opened" },
      reviewTrigger: "pr_opened",
      providerRepoId: "9001",
      providerPrNumber: 42,
      headSha: "headsha",
      baseSha: "basesha",
    },
  });

  const result = await processProviderWebhook("github", VALID_PR_BODY, {}, deps);

  assert.deepEqual(result, { status: 202, body: { ok: true } });
  assert.equal(rec.insertCalls.length, 1);
  assert.equal(rec.insertCalls[0]!.signatureValid, true);
  assert.equal(rec.insertCalls[0]!.organizationId, "org-uuid");
  assert.equal(rec.insertCalls[0]!.repositoryId, "repo-uuid");
  assert.equal(rec.enqueueCalls.length, 1);
  assert.deepEqual(rec.enqueueCalls[0], {
    source: "webhook",
    webhookEventId: "evt-1",
    repositoryId: "repo-uuid",
    organizationId: "org-uuid",
    provider: "github",
    prNumber: 42,
    headSha: "headsha",
    baseSha: "basesha",
  });
  // status: enqueued (worker will later flip to processed/failed)
  assert.equal(rec.statusCalls.length, 1);
  assert.equal(rec.statusCalls[0]!.id, "evt-1");
  assert.equal(rec.statusCalls[0]!.status, "enqueued");
});

test("processProviderWebhook: matched + non-reviewable event marks 'processed' immediately", async () => {
  const { deps, rec } = buildDeps({
    repo: REPO,
    event: {
      provider: "github",
      deliveryId: "d5b",
      eventType: "ping",
      signatureValid: true,
      rawPayload: {},
    },
  });

  const result = await processProviderWebhook("github", VALID_PR_BODY, {}, deps);

  assert.deepEqual(result, { status: 202, body: { ok: true } });
  assert.equal(rec.enqueueCalls.length, 0);
  assert.equal(rec.statusCalls.length, 1);
  assert.equal(rec.statusCalls[0]!.status, "processed");
});

test("processProviderWebhook: enqueue throws -> mark failed, rethrow original error", async () => {
  const enqueueErr = new Error("redis down");
  const { deps, rec } = buildDeps({
    repo: REPO,
    event: {
      provider: "github",
      deliveryId: "d-fail",
      eventType: "pull_request",
      signatureValid: true,
      rawPayload: { action: "opened" },
      reviewTrigger: "pr_opened",
      providerRepoId: "9001",
      providerPrNumber: 42,
      headSha: "headsha",
      baseSha: "basesha",
    },
    enqueueShouldThrow: enqueueErr,
  });

  await assert.rejects(
    () => processProviderWebhook("github", VALID_PR_BODY, {}, deps),
    (err: unknown) => err === enqueueErr
  );
  assert.equal(rec.statusCalls.length, 1);
  assert.equal(rec.statusCalls[0]!.status, "failed");
  assert.match(rec.statusCalls[0]!.errorMessage ?? "", /redis down/);
});

test("processProviderWebhook: matched + valid signature + non-reviewable event inserts but does not enqueue", async () => {
  const { deps, rec } = buildDeps({
    repo: REPO,
    event: {
      provider: "github",
      deliveryId: "d5",
      eventType: "ping",
      signatureValid: true,
      rawPayload: {},
    },
  });

  const result = await processProviderWebhook("github", VALID_PR_BODY, {}, deps);

  assert.deepEqual(result, { status: 202, body: { ok: true } });
  assert.equal(rec.insertCalls.length, 1);
  assert.equal(rec.enqueueCalls.length, 0);
});

test("processProviderWebhook: duplicate delivery returns ok+duplicate without enqueue", async () => {
  const { deps, rec } = buildDeps({
    repo: REPO,
    insertResult: null,
    event: {
      provider: "gitee",
      deliveryId: "d6",
      eventType: "Merge Request Hook",
      signatureValid: true,
      rawPayload: {},
      reviewTrigger: "pr_opened",
      providerRepoId: "9001",
      providerPrNumber: 1,
      headSha: "h",
      baseSha: "b",
    },
  });

  const result = await processProviderWebhook("gitee", VALID_PR_BODY, {}, deps);

  assert.deepEqual(result, { status: 200, body: { ok: true, duplicate: true } });
  assert.equal(rec.enqueueCalls.length, 0);
});
