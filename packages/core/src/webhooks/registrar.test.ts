import { test } from "node:test";
import assert from "node:assert/strict";

import { AppError, ErrorCode } from "../errors.js";
import { registerRepoWebhook, type WebhookRegistrarProvider } from "./registrar.js";

const FULL_NAME = "owner/repo";
const URL = "https://app.example.com/api/webhooks/github";
const SECRET = "s3cret";

function mkProvider(impl: Partial<WebhookRegistrarProvider>): WebhookRegistrarProvider {
  return {
    listWebhooks: async () => [],
    createWebhook: async () => ({ hookId: "new-id", url: URL, active: true }),
    ...impl,
  };
}

test("registerRepoWebhook: list 命中同 URL → already_exists 复用 hookId", async () => {
  let createCalled = 0;
  const provider = mkProvider({
    listWebhooks: async () => [
      { hookId: "h-123", url: URL, active: true },
      { hookId: "other", url: "https://other.example.com/hook", active: true },
    ],
    createWebhook: async () => {
      createCalled++;
      return { hookId: "x", url: URL, active: true };
    },
  });
  const result = await registerRepoWebhook({
    provider, fullName: FULL_NAME, webhookUrl: URL, secret: SECRET, credential: {},
  });
  assert.equal(result.status, "already_exists");
  assert.equal(result.hookId, "h-123");
  assert.equal(createCalled, 0);
});

test("registerRepoWebhook: 无命中 → createWebhook → created", async () => {
  const provider = mkProvider({
    listWebhooks: async () => [{ hookId: "other", url: "https://nope.com", active: true }],
    createWebhook: async () => ({ hookId: "h-new", url: URL, active: true }),
  });
  const result = await registerRepoWebhook({
    provider, fullName: FULL_NAME, webhookUrl: URL, secret: SECRET, credential: {},
  });
  assert.equal(result.status, "created");
  assert.equal(result.hookId, "h-new");
});

test("registerRepoWebhook: 401/403 → WebhookPermissionDenied", async () => {
  const provider = mkProvider({
    createWebhook: async () => {
      throw new AppError(ErrorCode.PlatformCallbackAuthFailed, "scope missing");
    },
  });
  await assert.rejects(
    () => registerRepoWebhook({
      provider, fullName: FULL_NAME, webhookUrl: URL, secret: SECRET, credential: {},
    }),
    (err) => err instanceof AppError && err.code === ErrorCode.WebhookPermissionDenied
  );
});

test("registerRepoWebhook: 未实现 provider → WebhookUnsupported", async () => {
  class NotImpl extends AppError {
    constructor() {
      super(ErrorCode.PlatformCallback, "not implemented");
      this.name = "GitProviderNotImplementedError";
    }
  }
  const provider = mkProvider({
    listWebhooks: async () => {
      throw new NotImpl();
    },
  });
  await assert.rejects(
    () => registerRepoWebhook({
      provider, fullName: FULL_NAME, webhookUrl: URL, secret: SECRET, credential: {},
    }),
    (err) => err instanceof AppError && err.code === ErrorCode.WebhookUnsupported
  );
});

test("registerRepoWebhook: 5xx / 其他 AppError → WebhookProviderUnavailable", async () => {
  const provider = mkProvider({
    createWebhook: async () => {
      throw new AppError(ErrorCode.DependencyApiTimeout, "502 bad gateway");
    },
  });
  await assert.rejects(
    () => registerRepoWebhook({
      provider, fullName: FULL_NAME, webhookUrl: URL, secret: SECRET, credential: {},
    }),
    (err) => err instanceof AppError && err.code === ErrorCode.WebhookProviderUnavailable
  );
});

test("registerRepoWebhook: 非 AppError 也归为 WebhookProviderUnavailable", async () => {
  const provider = mkProvider({
    listWebhooks: async () => {
      throw new TypeError("boom");
    },
  });
  await assert.rejects(
    () => registerRepoWebhook({
      provider, fullName: FULL_NAME, webhookUrl: URL, secret: SECRET, credential: {},
    }),
    (err) => err instanceof AppError && err.code === ErrorCode.WebhookProviderUnavailable
  );
});

test("registerRepoWebhook: 默认事件为 pull_request", async () => {
  let capturedEvents: string[] | null = null;
  const provider = mkProvider({
    createWebhook: async (_full, input) => {
      capturedEvents = input.events;
      return { hookId: "h", url: input.url, active: true };
    },
  });
  await registerRepoWebhook({
    provider, fullName: FULL_NAME, webhookUrl: URL, secret: SECRET, credential: {},
  });
  assert.deepEqual(capturedEvents, ["pull_request"]);
});
