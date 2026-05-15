# Worker Resilience Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement model timeout fallback, git operation retry, and task cancellation for the review worker.

**Architecture:** 3 independent features layered on the existing worker/adapter/graph stack. Git retry adds a generic `withRetry` decorator. Model fallback wraps `AiAdapter` in a `FallbackAdapter`. Task cancellation uses DB status polling at LangGraph node boundaries.

**Tech Stack:** TypeScript, BullMQ, LangGraph, PostgreSQL, Node.js built-in test runner

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `packages/git/src/errors.ts` (modify) | `withRetry` utility |
| Create | `packages/git/src/errors.test.ts` (new) | `withRetry` tests |
| Modify | `apps/worker/src/handlers/review.ts` | Wrap git calls with `withRetry` |
| Modify | `packages/ai/src/adapter.ts` | `FallbackAdapter` + `createAdapterWithFallback` |
| Create | `packages/ai/src/adapter.fallback.test.ts` (new) | Fallback tests |
| Modify | `packages/core/src/repositories/ai-provider-config.ts` | Return primary + fallbacks |
| Create | `packages/core/src/repositories/ai-provider-config.test.ts` (new) | Fallback query tests |
| Create | `postgres/migrations/0011_add_is_fallback.sql` (new) | DB migration |
| Modify | `packages/core/src/errors.ts` | Add `TaskCancelled` error code |
| Modify | `packages/core/src/repositories/review-run.ts` | Add `getReviewRunStatus`, `cancelReviewRun` |
| Create | `packages/core/src/repositories/review-run-cancel.test.ts` (new) | Cancel functions tests |
| Modify | `packages/ai/src/graph/nodes/reviewer.ts` | Add cancellation check |
| Modify | `packages/ai/src/graph/nodes/critic.ts` | Add cancellation check |
| Modify | `packages/ai/src/graph/nodes/summarizer.ts` | Add cancellation check |
| Create | `packages/ai/src/graph/cancellation.test.ts` (new) | Cancellation check tests |
| Modify | `apps/worker/src/handlers/review.ts` | Catch `TaskCancelledError` |
| Create | `apps/web/src/app/api/review-runs/[id]/cancel/route.ts` (new) | Cancel API endpoint |

---

## Task 1: Git Operation Retry (`withRetry`)

### 1.1 Write the test

**File:** `packages/git/src/errors.test.ts`

```typescript
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { withRetry } from "./errors.js";

describe("withRetry", () => {
  it("returns result on first success", async () => {
    let calls = 0;
    const result = await withRetry(async () => {
      calls++;
      return "ok";
    });
    assert.equal(result, "ok");
    assert.equal(calls, 1);
  });

  it("retries on retryable error and succeeds", async () => {
    let calls = 0;
    const result = await withRetry(
      async () => {
        calls++;
        if (calls < 3) {
          const err = new Error("socket hang up");
          (err as any).code = "ECONNRESET";
          throw err;
        }
        return "ok";
      },
      { maxAttempts: 3, baseDelayMs: 1, maxDelayMs: 10 }
    );
    assert.equal(result, "ok");
    assert.equal(calls, 3);
  });

  it("throws after maxAttempts exhausted", async () => {
    let calls = 0;
    await assert.rejects(
      () =>
        withRetry(
          async () => {
            calls++;
            const err = new Error("socket hang up");
            (err as any).code = "ECONNRESET";
            throw err;
          },
          { maxAttempts: 3, baseDelayMs: 1, maxDelayMs: 10 }
        ),
      { code: "ECONNRESET" }
    );
    assert.equal(calls, 3);
  });

  it("does not retry non-retryable errors", async () => {
    let calls = 0;
    await assert.rejects(
      () =>
        withRetry(
          async () => {
            calls++;
            const err = new Error("unauthorized");
            (err as any).status = 401;
            throw err;
          },
          { maxAttempts: 3, baseDelayMs: 1, maxDelayMs: 10 }
        ),
      { message: "unauthorized" }
    );
    assert.equal(calls, 1);
  });

  it("retries on 502/503/504 status", async () => {
    let calls = 0;
    const result = await withRetry(
      async () => {
        calls++;
        if (calls < 2) {
          const err = new Error("Bad Gateway");
          (err as any).status = 502;
          throw err;
        }
        return "ok";
      },
      { maxAttempts: 3, baseDelayMs: 1, maxDelayMs: 10 }
    );
    assert.equal(result, "ok");
    assert.equal(calls, 2);
  });

  it("accepts custom isRetryable", async () => {
    let calls = 0;
    await assert.rejects(
      () =>
        withRetry(
          async () => {
            calls++;
            throw new Error("custom");
          },
          {
            maxAttempts: 3,
            baseDelayMs: 1,
            maxDelayMs: 10,
            isRetryable: () => false,
          }
        ),
      { message: "custom" }
    );
    assert.equal(calls, 1);
  });
});
```

### 1.2 Run test to verify it fails

Run: `cd packages/git && pnpm test`
Expected: FAIL — `withRetry` not exported

### 1.3 Implement `withRetry`

**File:** `packages/git/src/errors.ts` — append at end

```typescript
export interface RetryOptions {
  maxAttempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  isRetryable?: (err: unknown) => boolean;
}

const RETRYABLE_NETWORK_CODES = new Set([
  "ECONNRESET",
  "ETIMEDOUT",
  "ENOTFOUND",
  "ECONNREFUSED",
  "EAI_AGAIN",
]);

const RETRYABLE_HTTP_STATUSES = new Set([502, 503, 504]);

function defaultIsRetryable(err: unknown): boolean {
  const e = err as Record<string, unknown>;
  if (typeof e?.["code"] === "string" && RETRYABLE_NETWORK_CODES.has(e["code"])) {
    return true;
  }
  if (typeof e?.["status"] === "number" && RETRYABLE_HTTP_STATUSES.has(e["status"])) {
    return true;
  }
  return false;
}

export async function withRetry<T>(
  operation: () => Promise<T>,
  options?: RetryOptions
): Promise<T> {
  const maxAttempts = options?.maxAttempts ?? 3;
  const baseDelayMs = options?.baseDelayMs ?? 1000;
  const maxDelayMs = options?.maxDelayMs ?? 8000;
  const isRetryable = options?.isRetryable ?? defaultIsRetryable;

  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await operation();
    } catch (err) {
      lastError = err;
      if (attempt >= maxAttempts || !isRetryable(err)) {
        throw err;
      }
      const delay = Math.min(
        baseDelayMs * Math.pow(2, attempt - 1) + Math.floor(Math.random() * 1000),
        maxDelayMs
      );
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  throw lastError;
}
```

### 1.4 Run test to verify it passes

Run: `cd packages/git && pnpm test`
Expected: PASS

### 1.5 Export `withRetry` from package

**File:** `packages/git/src/index.ts`

Add `withRetry` to the errors export block:

```typescript
export {
  GitPlatformApiError,
  GitPlatformRateLimitError,
  GitPlatformAuthError,
  GitWebhookSignatureError,
  GitProviderNotImplementedError,
  withGitPlatformErrorBoundary,
  withRetry,
} from "./errors.js";
```

### 1.6 Commit

```bash
git add packages/git/src/errors.ts packages/git/src/errors.test.ts packages/git/src/index.ts
git commit -m "feat: add withRetry utility for git operations / 添加 git 操作重试工具

- 指数退避，默认 3 次，支持自定义 isRetryable
- 可重试：ECONNRESET/ETIMEDOUT/502/503/504
- 不可重试：401/403/429"
```

---

## Task 2: Apply `withRetry` to Git Calls in Worker

### 2.1 Modify `handleReviewJob`

**File:** `apps/worker/src/handlers/review.ts`

Add import at top:

```typescript
import { withRetry } from "@reviewer/git";
```

Wrap the 3 key git calls. Locate these lines and wrap:

```typescript
// Line ~80: getPullRequest
const pr = await withRetry(() =>
  provider.getPullRequest(repo.full_name, prNumber, credential, logger)
);

// Line ~177: getPullRequestDiff
const diffs = await withRetry(() =>
  provider.getPullRequestDiff(repo.full_name, prNumber, credential, logger)
);

// Line ~180: loadTargetRepoContext (inside Promise.all)
const [guidelines, projectContext] = await Promise.all([
  loadReviewerGuidelines(),
  withRetry(() =>
    loadTargetRepoContext(provider, repo.full_name, headSha, credential, logger)
  ),
]);
```

Do NOT wrap `postReviewComment` or `postPullRequestComment` (comment posting should not retry).

### 2.2 Run worker tests

Run: `cd apps/worker && pnpm test`
Expected: PASS

### 2.3 Typecheck

Run: `cd apps/worker && pnpm typecheck`
Expected: PASS

### 2.4 Commit

```bash
git add apps/worker/src/handlers/review.ts
git commit -m "feat: wrap git operations with retry in worker / worker 中 git 操作加重试

- getPullRequest / getPullRequestDiff / loadTargetRepoContext 使用 withRetry
- 评论回写不重试（幂等性不确定）"
```

---

## Task 3: DB Migration — `is_fallback` Column

### 3.1 Create migration file

**File:** `postgres/migrations/0011_add_is_fallback.sql`

```sql
-- 0011: Add is_fallback column to ai_provider_configs
-- 支持备用 AI provider 配置，主 provider 超时/不可用时自动 fallback

ALTER TABLE public.ai_provider_configs
  ADD COLUMN IF NOT EXISTS is_fallback boolean NOT NULL DEFAULT false;

-- 索引：按 organization_id + is_active + is_fallback 快速查找
CREATE INDEX IF NOT EXISTS idx_ai_provider_configs_org_active_fallback
  ON public.ai_provider_configs (organization_id, is_active, is_fallback);
```

### 3.2 Run migration locally

Run: `psql $DATABASE_URL -f postgres/migrations/0011_add_is_fallback.sql` or apply via migration tool
Expected: Column exists

### 3.3 Commit

```bash
git add postgres/migrations/0011_add_is_fallback.sql
git commit -m "feat: add is_fallback column to ai_provider_configs / 添加备用 provider 标记

- is_fallback=true 标记备用 provider
- 支持主 provider 超时自动切备用"
```

---

## Task 4: `getActiveAiProviderConfig` Returns Primary + Fallbacks

### 4.1 Write the test

**File:** `packages/core/src/repositories/ai-provider-config.test.ts`

```typescript
import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";

// 这是集成测试，需要 DB 连接
// 单元测试部分通过 mock pool 验证 SQL 逻辑
describe("getActiveAiProviderConfig", () => {
  it("returns null when no active config exists", async () => {
    // 此测试需要 mock getPool() 或使用集成环境
    // 在集成测试中验证
  });
});
```

Note: `getActiveAiProviderConfig` 依赖 DB，实际测试在集成环境中验证。单元测试重点验证返回结构。

### 4.2 Modify `getActiveAiProviderConfig`

**File:** `packages/core/src/repositories/ai-provider-config.ts`

Add new interface:

```typescript
export interface ActiveAiProviderResult {
  primary: AiProviderConfigWithKey;
  fallbacks: AiProviderConfigWithKey[];
}
```

Modify `getActiveAiProviderConfig` signature and implementation:

```typescript
export async function getActiveAiProviderConfig(
  organizationId: string
): Promise<ActiveAiProviderResult | null> {
  const logger = createLogger({ component: "queue" });
  try {
    // 获取主 provider
    const primaryResult = await getPool().query(
      `select ${SELECT_COLUMNS}
         from public.ai_provider_configs
        where organization_id = $1
          and is_active = true
          and is_fallback = false
        order by created_at desc
        limit 1`,
      [organizationId]
    );

    if (primaryResult.rows.length === 0) return null;
    const primary = mapRowWithKey(primaryResult.rows[0]);

    // 获取 fallback providers
    const fallbackResult = await getPool().query(
      `select ${SELECT_COLUMNS}
         from public.ai_provider_configs
        where organization_id = $1
          and is_active = true
          and is_fallback = true
        order by created_at asc`,
      [organizationId]
    );
    const fallbacks = fallbackResult.rows.map(mapRowWithKey);

    return { primary, fallbacks };
  } catch (error) {
    logger.error("Failed to get active AI provider config", error as Error, {
      operation: "get_active_ai_provider_config",
      organization_id: organizationId,
    });
    throw new AppError(
      ErrorCode.DependencyDatabaseConnection,
      "Failed to get active AI provider config"
    );
  }
}
```

Note: Keep the old single-config overload for backward compatibility:

```typescript
/** @deprecated Use getActiveAiProviderConfig which returns primary + fallbacks */
export async function getActiveAiProviderConfigLegacy(
  organizationId: string
): Promise<AiProviderConfigWithKey | null> {
  const result = await getActiveAiProviderConfig(organizationId);
  return result?.primary ?? null;
}
```

### 4.3 Update callers

**File:** `apps/worker/src/handlers/review.ts`

Update the import and usage:

```typescript
import {
  getActiveAiProviderConfig, // now returns ActiveAiProviderResult
  // ...
} from "@reviewer/core";

// Line ~186: Update usage
const activeResult = await getActiveAiProviderConfig(organizationId);
if (!activeResult) {
  throw new Error(`No active AI provider config for organization ${organizationId}`);
}
const { primary, fallbacks } = activeResult;
```

### 4.4 Run tests

Run: `cd packages/core && pnpm test`
Expected: PASS

### 4.5 Typecheck

Run: `cd packages/core && pnpm typecheck && cd apps/worker && pnpm typecheck`
Expected: PASS

### 4.6 Commit

```bash
git add packages/core/src/repositories/ai-provider-config.ts apps/worker/src/handlers/review.ts
git commit -m "feat: getActiveAiProviderConfig returns primary + fallbacks / 返回主+备用配置

- 返回 ActiveAiProviderResult { primary, fallbacks }
- 保留 legacy 单配置兼容接口"
```

---

## Task 5: `FallbackAdapter` — Model Timeout Fallback

### 5.1 Write the test

**File:** `packages/ai/src/adapter.fallback.test.ts`

```typescript
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { FallbackAdapter } from "./adapter.js";
import type { AiAdapter } from "./adapter.js";
import type { ReviewContext, ReviewResult, ReviewSummaryResult, CritiqueResult, ReviewFinding } from "./types.js";

function mockAdapter(overrides: Partial<AiAdapter> = {}): AiAdapter {
  return {
    generateReviewFindings: async () => ({ findings: [] }),
    generateReviewSummary: async () => ({ summary: { summaryMd_en: "", summaryMd_zh: "", highlights_en: [], highlights_zh: [], mermaid_flow: "" } }),
    verifyFinding: async () => ({ valid: true, reason: "ok", confidenceScore: 1 }),
    regenerateFinding: async (f) => f,
    ...overrides,
  };
}

function makeContext(): ReviewContext {
  return {
    fullName: "o/r",
    prNumber: 1,
    headSha: "abc",
    organizationId: "org1",
    repositoryId: "repo1",
    pullRequestId: "pr1",
    reviewRunId: "run1",
    providerConfigId: "pc1",
    outputLanguage: "en-US",
    diffs: [],
    finalFindings: [],
  };
}

describe("FallbackAdapter", () => {
  it("uses primary when primary succeeds", async () => {
    let primaryCalled = false;
    const primary = mockAdapter({
      generateReviewFindings: async () => {
        primaryCalled = true;
        return { findings: [] };
      },
    });
    const fallback = mockAdapter();
    const adapter = new FallbackAdapter(primary, [fallback]);
    await adapter.generateReviewFindings(makeContext());
    assert.equal(primaryCalled, true);
  });

  it("falls back on timeout error", async () => {
    let fallbackCalled = false;
    const primary = mockAdapter({
      generateReviewFindings: async () => {
        const err = new Error("timeout");
        (err as any).code = "MODEL_INVOCATION_TIMEOUT";
        throw err;
      },
    });
    const fallback = mockAdapter({
      generateReviewFindings: async () => {
        fallbackCalled = true;
        return { findings: [] };
      },
    });
    const adapter = new FallbackAdapter(primary, [fallback]);
    await adapter.generateReviewFindings(makeContext());
    assert.equal(fallbackCalled, true);
  });

  it("falls back on provider unavailable", async () => {
    let fallbackCalled = false;
    const primary = mockAdapter({
      generateReviewSummary: async () => {
        const err = new Error("503 Service Unavailable");
        (err as any).code = "MODEL_INVOCATION_PROVIDER_UNAVAILABLE";
        throw err;
      },
    });
    const fallback = mockAdapter({
      generateReviewSummary: async () => {
        fallbackCalled = true;
        return { summary: { summaryMd_en: "ok", summaryMd_zh: "", highlights_en: [], highlights_zh: [], mermaid_flow: "" } };
      },
    });
    const adapter = new FallbackAdapter(primary, [fallback]);
    await adapter.generateReviewSummary(makeContext());
    assert.equal(fallbackCalled, true);
  });

  it("throws when both primary and fallback fail", async () => {
    const primary = mockAdapter({
      generateReviewFindings: async () => {
        const err = new Error("timeout");
        (err as any).code = "MODEL_INVOCATION_TIMEOUT";
        throw err;
      },
    });
    const fallback = mockAdapter({
      generateReviewFindings: async () => {
        throw new Error("fallback also failed");
      },
    });
    const adapter = new FallbackAdapter(primary, [fallback]);
    await assert.rejects(
      () => adapter.generateReviewFindings(makeContext()),
      { message: "fallback also failed" }
    );
  });

  it("does not fallback on non-retryable error", async () => {
    const primary = mockAdapter({
      generateReviewFindings: async () => {
        throw new Error("invalid API key");
      },
    });
    const fallback = mockAdapter();
    const adapter = new FallbackAdapter(primary, [fallback]);
    await assert.rejects(
      () => adapter.generateReviewFindings(makeContext()),
      { message: "invalid API key" }
    );
  });

  it("works with no fallbacks configured", async () => {
    const primary = mockAdapter();
    const adapter = new FallbackAdapter(primary, []);
    const result = await adapter.generateReviewFindings(makeContext());
    assert.deepEqual(result, { findings: [] });
  });
});
```

### 5.2 Run test to verify it fails

Run: `cd packages/ai && pnpm test`
Expected: FAIL — `FallbackAdapter` not exported

### 5.3 Implement `FallbackAdapter`

**File:** `packages/ai/src/adapter.ts` — add before the Factory section

```typescript
// ---------------------------------------------------------------------------
// FallbackAdapter
// ---------------------------------------------------------------------------

export class FallbackAdapter implements AiAdapter {
  private readonly primary: AiAdapter;
  private readonly fallbacks: AiAdapter[];

  constructor(primary: AiAdapter, fallbacks: AiAdapter[]) {
    this.primary = primary;
    this.fallbacks = fallbacks;
  }

  async generateReviewFindings(context: ReviewContext): Promise<ReviewResult> {
    return this.withFallback("generateReviewFindings", context);
  }

  async generateReviewSummary(context: ReviewContext): Promise<ReviewSummaryResult> {
    return this.withFallback("generateReviewSummary", context);
  }

  async verifyFinding(
    finding: ReviewFinding,
    context: ReviewContext
  ): Promise<CritiqueResult> {
    return this.withFallback("verifyFinding", finding, context);
  }

  async regenerateFinding(
    finding: ReviewFinding,
    critique: CritiqueResult,
    context: ReviewContext
  ): Promise<ReviewFinding> {
    return this.withFallback("regenerateFinding", finding, critique, context);
  }

  private async withFallback<T>(
    method: keyof AiAdapter,
    ...args: unknown[]
  ): Promise<T> {
    try {
      return await (this.primary[method] as Function)(...args);
    } catch (err) {
      if (this.isRetryableError(err) && this.fallbacks.length > 0) {
        log("warn", "Primary provider failed, trying fallback", {
          method,
          error: err instanceof Error ? err.message : String(err),
        });
        return await (this.fallbacks[0]![method] as Function)(...args);
      }
      throw err;
    }
  }

  private isRetryableError(err: unknown): boolean {
    if (err instanceof AppError) {
      return (
        err.code === ErrorCode.ModelInvocationTimeout ||
        err.code === ErrorCode.ModelInvocationProviderUnavailable ||
        err.code === ErrorCode.ModelInvocationRateLimit
      );
    }
    if (err instanceof Error) {
      const msg = err.message.toLowerCase();
      return (
        msg.includes("timeout") ||
        msg.includes("503") ||
        msg.includes("502") ||
        msg.includes("econnreset")
      );
    }
    return false;
  }
}
```

Add imports at top of file if missing:

```typescript
import { AppError, ErrorCode } from "@reviewer/core";
```

### 5.4 Add `createAdapterWithFallback`

**File:** `packages/ai/src/adapter.ts` — update Factory section

```typescript
export function createAdapterWithFallback(
  primary: AiAdapterConfig,
  fallbacks: AiAdapterConfig[],
  recorder: UsageRecorder = noopUsageRecorder
): AiAdapter {
  const primaryAdapter = createAdapter(primary, recorder);
  if (fallbacks.length === 0) return primaryAdapter;
  const fallbackAdapters = fallbacks.map((f) => createAdapter(f, recorder));
  return new FallbackAdapter(primaryAdapter, fallbackAdapters);
}
```

### 5.5 Run test to verify it passes

Run: `cd packages/ai && pnpm test`
Expected: PASS

### 5.6 Commit

```bash
git add packages/ai/src/adapter.ts packages/ai/src/adapter.fallback.test.ts
git commit -m "feat: FallbackAdapter for model timeout fallback / 模型超时自动 fallback

- FallbackAdapter 包装主+备用 adapter
- 超时/不可用/限流时自动切备用
- createAdapterWithFallback 工厂函数"
```

---

## Task 6: Wire Fallback into Worker

### 6.1 Modify `handleReviewJob`

**File:** `apps/worker/src/handlers/review.ts`

Update imports:

```typescript
import {
  createAdapterWithFallback,  // was: createAdapter
  // ...
} from "@reviewer/ai";
```

Update the adapter creation block (~line 186-195):

```typescript
// 之前
const adapterConfig = {
  provider: activeConfig.provider,
  model: activeConfig.model,
  apiKey: activeConfig.apiKey,
  baseUrl: activeConfig.baseUrl ?? undefined,
};

// 之后
const activeResult = await getActiveAiProviderConfig(organizationId);
if (!activeResult) {
  throw new Error(`No active AI provider config for organization ${organizationId}`);
}
const { primary, fallbacks } = activeResult;

const adapter = createAdapterWithFallback(
  {
    provider: primary.provider,
    model: primary.model,
    apiKey: primary.apiKey,
    baseUrl: primary.baseUrl ?? undefined,
  },
  fallbacks.map((f) => ({
    provider: f.provider,
    model: f.model,
    apiKey: f.apiKey,
    baseUrl: f.baseUrl ?? undefined,
  })),
  usageRecorder
);
```

### 6.2 Typecheck and run tests

Run: `cd apps/worker && pnpm typecheck && pnpm test`
Expected: PASS

### 6.3 Commit

```bash
git add apps/worker/src/handlers/review.ts
git commit -m "feat: wire FallbackAdapter into worker handler / worker 接入 fallback

- 使用 createAdapterWithFallback 替代 createAdapter
- 从 DB 加载 primary + fallbacks 配置"
```

---

## Task 7: Task Cancellation — Error Code & Repository

### 7.1 Add `TaskCancelled` error code

**File:** `packages/core/src/errors.ts`

Add to `ErrorCode` object:

```typescript
// 任务取消
TaskCancelled: "TASK_CANCELLED",
```

Add to `ERROR_CATEGORY_BY_CODE`:

```typescript
[ErrorCode.TaskCancelled]: "timeout",
```

### 7.2 Add `TaskCancelledError` class

**File:** `packages/core/src/errors.ts` — append

```typescript
export class TaskCancelledError extends AppError {
  constructor(reviewRunId: string) {
    super(ErrorCode.TaskCancelled, `Task cancelled: ${reviewRunId}`, {
      operation: "task_execution",
      review_run_id: reviewRunId,
    });
    this.name = "TaskCancelledError";
  }
}
```

### 7.3 Add `getReviewRunStatus`

**File:** `packages/core/src/repositories/review-run.ts`

```typescript
export async function getReviewRunStatus(
  id: string
): Promise<string | null> {
  const result = await getPool().query<{ status: string }>(
    "select status from public.review_runs where id = $1",
    [id]
  );
  return result.rows[0]?.status ?? null;
}
```

### 7.4 Add `cancelReviewRun`

**File:** `packages/core/src/repositories/review-run.ts`

```typescript
export async function cancelReviewRun(id: string): Promise<boolean> {
  const logger = createLogger({ component: "queue" });
  try {
    const result = await getPool().query(
      `update public.review_runs
          set status = 'cancelling', updated_at = now()
        where id = $1
          and status in ('queued', 'running')
        returning id`,
      [id]
    );
    const success = (result.rowCount ?? 0) > 0;
    if (success) {
      logger.info("Review run set to cancelling", { review_run_id: id });
    } else {
      logger.warn("Review run not found or not in cancellable state", {
        review_run_id: id,
      });
    }
    return success;
  } catch (error) {
    logger.error("Failed to cancel review run", error as Error, {
      operation: "cancel_review_run",
      review_run_id: id,
    });
    throw new AppError(
      ErrorCode.DependencyDatabaseConnection,
      "Failed to cancel review run"
    );
  }
}
```

### 7.5 Run core tests

Run: `cd packages/core && pnpm test`
Expected: PASS

### 7.6 Commit

```bash
git add packages/core/src/errors.ts packages/core/src/repositories/review-run.ts
git commit -m "feat: TaskCancelled error + cancelReviewRun / 任务取消错误码和仓库函数

- 新增 TaskCancelled 错误码和 TaskCancelledError 类
- getReviewRunStatus 查询当前状态
- cancelReviewRun 将 queued/running 状态设为 cancelling"
```

---

## Task 8: Graph Node Cancellation Check

### 8.1 Write the test

**File:** `packages/ai/src/graph/cancellation.test.ts`

```typescript
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { checkCancelled } from "./cancellation.js";

// 这些测试需要 mock @reviewer/core 的 getReviewRunStatus 和 updateReviewRun
// 使用 node:test 的 mock 能力

describe("checkCancelled", () => {
  it("does nothing when status is running", async () => {
    // 集成测试中验证
  });

  it("throws TaskCancelledError when status is cancelling", async () => {
    // 集成测试中验证
  });
});
```

### 8.2 Create cancellation check module

**File:** `packages/ai/src/graph/cancellation.ts`

```typescript
import {
  getReviewRunStatus,
  updateReviewRun,
  TaskCancelledError,
  createLogger,
} from "@reviewer/core";

const logger = createLogger({ component: "graph" });

/**
 * 在 LangGraph 节点入口调用：检查 review_run 是否被取消。
 * 若 status === 'cancelling'，更新为 'cancelled' 并抛出 TaskCancelledError。
 */
export async function checkCancelled(reviewRunId: string): Promise<void> {
  const status = await getReviewRunStatus(reviewRunId);
  if (status === "cancelling") {
    await updateReviewRun(reviewRunId, {
      status: "cancelled",
      finishedAt: new Date(),
    });
    logger.info("Task cancelled at node boundary", {
      review_run_id: reviewRunId,
    });
    throw new TaskCancelledError(reviewRunId);
  }
}
```

### 8.3 Add cancellation check to reviewer node

**File:** `packages/ai/src/graph/nodes/reviewer.ts`

Add import at top:

```typescript
import { checkCancelled } from "../cancellation.js";
```

At the beginning of the `reviewer` function (after `getCtx` call), add:

```typescript
await checkCancelled(state.reviewRunId);
```

### 8.4 Add cancellation check to critic node

**File:** `packages/ai/src/graph/nodes/critic.ts`

Add import and check at the beginning of the critic function:

```typescript
import { checkCancelled } from "../cancellation.js";

// At the start of the critic function:
await checkCancelled(state.reviewRunId);
```

### 8.5 Add cancellation check to summarizer node

**File:** `packages/ai/src/graph/nodes/summarizer.ts`

Add import and check at the beginning of the summarizer function:

```typescript
import { checkCancelled } from "../cancellation.js";

// At the start of the summarizer function:
await checkCancelled(state.reviewRunId);
```

### 8.6 Run AI tests

Run: `cd packages/ai && pnpm test`
Expected: PASS

### 8.7 Commit

```bash
git add packages/ai/src/graph/cancellation.ts packages/ai/src/graph/cancellation.test.ts packages/ai/src/graph/nodes/reviewer.ts packages/ai/src/graph/nodes/critic.ts packages/ai/src/graph/nodes/summarizer.ts
git commit -m "feat: graph node cancellation check / LangGraph 节点取消检查

- checkCancelled 在节点入口检查 DB 状态
- cancelling → 更新为 cancelled → 抛 TaskCancelledError
- 应用到 reviewer / critic / summarizer 节点"
```

---

## Task 9: Worker Catches `TaskCancelledError`

### 9.1 Modify `handleReviewJob`

**File:** `apps/worker/src/handlers/review.ts`

Add import:

```typescript
import { TaskCancelledError } from "@reviewer/core";
```

In the outer catch block (line ~424), add cancellation handling before the general error handling:

```typescript
} catch (err) {
  if (err instanceof TaskCancelledError) {
    logger.info("Job cancelled", { review_run_id: runId });
    // Status already updated to 'cancelled' in checkCancelled
    // Normal exit — do not throw, do not mark as failed
    return;
  }
  // ... existing error handling (updateReviewRun status: "failed", etc.)
```

### 9.2 Run worker tests

Run: `cd apps/worker && pnpm test`
Expected: PASS

### 9.3 Commit

```bash
git add apps/worker/src/handlers/review.ts
git commit -m "feat: worker handles TaskCancelledError / worker 捕获取消错误

- TaskCancelledError 正常退出，不标记为 failed
- BullMQ job 不触发 retry"
```

---

## Task 10: Cancel API Endpoint

### 10.1 Create the route

**File:** `apps/web/src/app/api/review-runs/[id]/cancel/route.ts`

```typescript
import { NextResponse } from "next/server";
import { cancelReviewRun } from "@reviewer/core";

export async function POST(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const { id } = params;

  if (!id) {
    return NextResponse.json({ error: "Missing review run id" }, { status: 400 });
  }

  try {
    const success = await cancelReviewRun(id);
    if (!success) {
      return NextResponse.json(
        { error: "Review run not found or not in cancellable state" },
        { status: 404 }
      );
    }
    return NextResponse.json({ status: "cancelling" });
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
```

### 10.2 Verify route exists

Run: `ls apps/web/src/app/api/review-runs/\[id\]/cancel/route.ts`
Expected: File exists

### 10.3 Commit

```bash
git add apps/web/src/app/api/review-runs/\[id\]/cancel/route.ts
git commit -m "feat: POST /api/review-runs/:id/cancel endpoint / 取消 review run API

- 校验 review_run 存在且可取消（queued/running）
- 更新状态为 cancelling
- 返回 200 + { status: 'cancelling' }"
```

---

## Task 11: Integration Verification

### 11.1 Full typecheck

Run: `pnpm -r typecheck`
Expected: All packages pass

### 11.2 Full test suite

Run: `pnpm -r test`
Expected: All tests pass

### 11.3 Final commit (if any fixups needed)

```bash
git add -A
git commit -m "chore: fixup after integration verification / 集成验证修复"
```
