# Worker Resilience: Fallback, Retry, Cancellation

**Date:** 2026-05-14
**Status:** Approved
**Scope:** §6 Queue & Worker 剩余 3 项未完成

---

## Overview

3 个独立功能，提升 worker 的容错和可控性：

1. **模型超时 fallback** — 主 AI provider 超时/不可用时自动切备用
2. **Git 操作重试** — 网络瞬时错误自动指数退避重试
3. **任务取消** — 支持取消正在执行的 review run

---

## §1 模型超时 Fallback

### 1.1 DB Schema 变更

`ai_provider_configs` 表新增字段：

```sql
ALTER TABLE public.ai_provider_configs
  ADD COLUMN is_fallback boolean NOT NULL DEFAULT false;
```

- `is_fallback = false`：主 provider（当前行为不变）
- `is_fallback = true`：备用 provider，同 organization 可多条
- 主 + fallback 属于同一 organization，由 `is_active` + `is_fallback` 组合筛选

### 1.2 Repository 层变更

**文件**: `packages/core/src/repositories/ai-provider-config.ts`

`getActiveAiProviderConfig` 返回类型变更：

```typescript
export interface ActiveAiProviderResult {
  primary: AiProviderConfigWithKey;
  fallbacks: AiProviderConfigWithKey[];
}

export async function getActiveAiProviderConfig(
  organizationId: string
): Promise<ActiveAiProviderResult | null>
```

查询逻辑：
- primary：`is_active = true AND is_fallback = false`
- fallbacks：`is_active = true AND is_fallback = true`，按 `created_at` 排序

### 1.3 FallbackAdapter

**文件**: `packages/ai/src/adapter.ts`

新增 `FallbackAdapter` 实现 `AiAdapter` 接口：

```typescript
export class FallbackAdapter implements AiAdapter {
  private readonly primary: AiAdapter;
  private readonly fallbacks: AiAdapter[];

  constructor(primary: AiAdapter, fallbacks: AiAdapter[]) { ... }

  async generateReviewFindings(context) {
    return this.withFallback('generateReviewFindings', context);
  }
  async generateReviewSummary(context) {
    return this.withFallback('generateReviewSummary', context);
  }
  async verifyFinding(finding, context) {
    return this.withFallback('verifyFinding', finding, context);
  }
  async regenerateFinding(finding, critique, context) {
    return this.withFallback('regenerateFinding', finding, critique, context);
  }

  private async withFallback(method, ...args) {
    try {
      return await this.primary[method](...args);
    } catch (err) {
      if (this.isRetryableError(err) && this.fallbacks.length > 0) {
        // log warning
        return await this.fallbacks[0][method](...args);
      }
      throw err;
    }
  }

  private isRetryableError(err: unknown): boolean {
    // 匹配: ModelInvocationTimeout, ModelInvocationProviderUnavailable,
    //        ModelInvocationRateLimit, 或 error message 含 timeout/503/502
  }
}
```

**可重试错误判断**：
- `AppError.code === ErrorCode.ModelInvocationTimeout`
- `AppError.code === ErrorCode.ModelInvocationProviderUnavailable`
- `AppError.code === ErrorCode.ModelInvocationRateLimit`
- 非 AppError：message 含 `timeout`、`503`、`502`、`ECONNRESET`

### 1.4 工厂函数

```typescript
export function createAdapterWithFallback(
  primary: AiAdapterConfig,
  fallbacks: AiAdapterConfig[],
  recorder?: UsageRecorder
): AiAdapter {
  const primaryAdapter = createAdapter(primary, recorder);
  if (fallbacks.length === 0) return primaryAdapter;
  const fallbackAdapters = fallbacks.map(f => createAdapter(f, recorder));
  return new FallbackAdapter(primaryAdapter, fallbackAdapters);
}
```

### 1.5 handleReviewJob 调整

**文件**: `apps/worker/src/handlers/review.ts`

```typescript
// 之前
const activeConfig = await getActiveAiProviderConfig(organizationId);
const adapter = createAdapter(adapterConfig, usageRecorder);

// 之后
const activeResult = await getActiveAiProviderConfig(organizationId);
if (!activeResult) throw new Error(...);
const { primary, fallbacks } = activeResult;
const adapter = createAdapterWithFallback(
  { provider: primary.provider, model: primary.model, apiKey: primary.apiKey, baseUrl: primary.baseUrl ?? undefined },
  fallbacks.map(f => ({ provider: f.provider, model: f.model, apiKey: f.apiKey, baseUrl: f.baseUrl ?? undefined })),
  usageRecorder
);
```

### 1.6 DB Migration

新增 migration 文件，添加 `is_fallback` 列。

---

## §2 Git 操作重试

### 2.1 withRetry 工具函数

**文件**: `packages/git/src/errors.ts`

```typescript
export interface RetryOptions {
  maxAttempts?: number;      // 默认 3
  baseDelayMs?: number;      // 默认 1000
  maxDelayMs?: number;       // 默认 8000
  isRetryable?: (err: unknown) => boolean;
}

export async function withRetry<T>(
  operation: () => Promise<T>,
  options?: RetryOptions
): Promise<T>
```

**默认 isRetryable**：
- 网络错误码：`ECONNRESET`、`ETIMEDOUT`、`ENOTFOUND`、`ECONNREFUSED`、`EAI_AGAIN`
- HTTP 状态码：502、503、504
- 不可重试：401、403、429（已有 `withGitPlatformErrorBoundary` 处理）

**退避计算**：
```
delay = min(baseDelayMs * 2^(attempt-1) + random(0, 1000), maxDelayMs)
```

**重试日志**：
每次重试通过 logger.warn 记录 attempt 次数、错误信息、下次延迟。

### 2.2 handleReviewJob 使用

**文件**: `apps/worker/src/handlers/review.ts`

对以下 3 个关键 git 调用包裹 `withRetry`：

```typescript
const pr = await withRetry(() =>
  provider.getPullRequest(repo.full_name, prNumber, credential, logger)
);

const diffs = await withRetry(() =>
  provider.getPullRequestDiff(repo.full_name, prNumber, credential, logger)
);

// loadTargetRepoContext 内部调用 getRepositoryFile，也需要包裹
const [guidelines, projectContext] = await Promise.all([
  loadReviewerGuidelines(),
  withRetry(() =>
    loadTargetRepoContext(provider, repo.full_name, headSha, credential, logger)
  ),
]);
```

**不重试的操作**：
- `postReviewComment` / `postPullRequestComment` — 评论回写幂等性不确定，不重试
- `getRepositoryWithCredential` — DB 操作，不重试

---

## §3 任务取消

### 3.1 ErrorCode 新增

**文件**: `packages/core/src/errors.ts`

```typescript
TaskCancelled: "TASK_CANCELLED",
```

分类映射：`TaskCancelled → "timeout"`

### 3.2 TaskCancelledError

```typescript
export class TaskCancelledError extends AppError {
  constructor(reviewRunId: string) {
    super(ErrorCode.TaskCancelled, `Task cancelled: ${reviewRunId}`, {
      operation: 'task_execution',
      review_run_id: reviewRunId,
    });
    this.name = 'TaskCancelledError';
  }
}
```

### 3.3 getReviewRunStatus

**文件**: `packages/core/src/repositories/review-run.ts`

```typescript
export async function getReviewRunStatus(id: string): Promise<string | null> {
  const result = await getPool().query<{ status: string }>(
    'select status from public.review_runs where id = $1',
    [id]
  );
  return result.rows[0]?.status ?? null;
}
```

### 3.4 cancelReviewRun

**文件**: `packages/core/src/repositories/review-run.ts`

```typescript
export async function cancelReviewRun(id: string): Promise<boolean> {
  const result = await getPool().query(
    `update public.review_runs
        set status = 'cancelling', updated_at = now()
      where id = $1
        and status in ('queued', 'running')
      returning id`,
    [id]
  );
  return (result.rowCount ?? 0) > 0;
}
```

### 3.5 Graph 节点级取消检查

**文件**: `packages/ai/src/graph/` 各节点

在每个 LangGraph 节点入口增加取消检查：

```typescript
import { getReviewRunStatus, updateReviewRun, TaskCancelledError } from '@reviewer/core';

async function checkCancelled(reviewRunId: string): Promise<void> {
  const status = await getReviewRunStatus(reviewRunId);
  if (status === 'cancelling') {
    await updateReviewRun(reviewRunId, { status: 'cancelled', finishedAt: new Date() });
    throw new TaskCancelledError(reviewRunId);
  }
}
```

在以下节点入口调用 `checkCancelled`：
- `reviewer` 节点（findings 生成）
- `summarizer` 节点
- `critic` 节点（verify/regenerate）
- `auditor` 节点

### 3.6 API 端点

**文件**: `apps/web/src/app/api/review-runs/[id]/cancel/route.ts` (或类似路径)

```typescript
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const { id } = params;
  const success = await cancelReviewRun(id);
  if (!success) {
    return NextResponse.json(
      { error: 'Review run not found or not in cancellable state' },
      { status: 404 }
    );
  }
  return NextResponse.json({ status: 'cancelling' });
}
```

### 3.7 handleReviewJob 捕获

**文件**: `apps/worker/src/handlers/review.ts`

```typescript
} catch (err) {
  if (err instanceof TaskCancelledError) {
    logger.info('Job cancelled', { review_run_id: runId });
    return; // 正常退出，不 throw，不标记 failed
  }
  // ... existing error handling
}
```

BullMQ 层面：cancelled 的 job 正常完成（不 throw），不会触发 retry。

---

## 实现顺序

1. §2 Git 重试（最简单，独立，无 DB 变更）
2. §1 模型 Fallback（需要 DB migration）
3. §3 任务取消（需要 API + graph + DB 三端联动）

## 测试策略

- §1：mock primary 超时 → 验证 fallback 被调用
- §2：mock 网络错误 → 验证重试次数和退避
- §3：mock DB 状态为 cancelling → 验证 TaskCancelledError 抛出
