# 日志和错误处理最佳实践

## 日志使用规范

### 日志级别选择

- **debug**: 详细的调试信息，仅在开发环境使用
- **info**: 重要的业务事件和状态变更
- **warn**: 潜在问题，但系统仍可继续运行
- **error**: 错误情况，需要关注和可能的人工干预

### 必需日志字段

所有日志必须包含以下基础字段：
- `level`: 日志级别
- `msg`: 日志消息
- `time`: ISO 8601 时间戳
- `component`: "web" | "worker" | "api" | "queue"
- `service`: "reviewer-web" | "reviewer-worker"

上下文字段（根据场景选择）：
- `request_id`: API 请求追踪 ID
- `task_id`: 后台任务 ID
- `organization_id`: 组织 ID（多租户隔离）
- `repository_id`: 仓库 ID
- `user_id`: 用户 ID
- `error_code`: 关联的错误码
- `error_category`: 错误类别

### 日志使用示例

```typescript
import { createLogger } from '@reviewer/core/logging';

// 创建基础 logger
const logger = createLogger({
  component: 'worker',
  service: 'reviewer-worker',
});

// 带上下文的日志
logger.info('Worker started', {
  queue: 'review-jobs',
  redis_url: redisUrl,
});

// 错误日志
try {
  // ...
} catch (error) {
  logger.error('Operation failed', error, {
    operation: 'process_job',
    task_id: job.id,
  });
}

// 子 logger 用于上下文传播
const jobLogger = logger.child({ taskId: job.id });
jobLogger.info('Job processing started');
```

### 禁止事项

- ❌ 不要使用 `console.log` 或 `console.error`
- ❌ 不要在日志中输出敏感信息（密码、token、PII）
- ❌ 不要在生产环境输出 debug 级别日志
- ❌ 不要吞掉错误而不记录日志

## 错误处理规范

### 错误分类

必须使用 `AppError` 类，包含：
- `code`: 具体错误码
- `category`: 错误类别
- `message`: 错误消息
- `context`: 结构化上下文

### 错误码使用

使用预定义的错误码，不要随意创建：

```typescript
import { AppError, ErrorCode } from '@reviewer/core/errors';

// 创建错误
const error = new AppError(
  ErrorCode.ModelInvocationTimeout,
  'Model invocation timeout',
  {
    operation: 'call_model',
    provider: 'anthropic',
    timeout_ms: 30000,
  }
);

// 抛出错误
throw error;
```

### 错误映射

使用错误映射器转换外部错误：

```typescript
import { mapModelInvocationError } from '@reviewer/core/errors/mappers';

try {
  await modelClient.completion(prompt);
} catch (error) {
  const appError = mapModelInvocationError(error, 'anthropic', {
    operation: 'call_model',
    request_id: requestId,
  });
  throw appError;
}
```

### 外部依赖边界

使用边界处理器保护外部依赖调用：

```typescript
import { withRedisErrorBoundary, withDatabaseErrorBoundary } from '@reviewer/core/boundaries/external-dependencies';

// Redis 操作
await withRedisErrorBoundary(
  () => redis.set(key, value),
  logger,
  { operation: 'set_cache' }
);

// 数据库操作
await withDatabaseErrorBoundary(
  () => db.query('SELECT * FROM users'),
  logger,
  { operation: 'fetch_users' }
);
```

### 错误处理流程

1. **捕获错误**: 在 try-catch 中捕获
2. **映射错误**: 使用映射器转换为 AppError
3. **记录日志**: 确保错误被记录
4. **重新抛出**: 除非明确处理，否则重新抛出

```typescript
try {
  await operation();
} catch (error) {
  const appError = mapModelInvocationError(error, provider, context);
  ensureErrorLogged(appError, logger);
  throw appError;
}
```

### 防止静默错误

使用 `ensureErrorLogged` 确保错误不被静默：

```typescript
import { ensureErrorLogged } from '@reviewer/core/errors/handler';

try {
  // 可能失败的代码
} catch (error) {
  // 确保错误被记录，不会静默
  ensureErrorLogged(error, logger, { operation: 'important_task' });
  throw error; // 重新抛出
}
```

### 禁止事项

- ❌ 不要使用空的 try-catch
- ❌ 不要捕获 Error 后不记录日志
- ❌ 不要在 API 响应中暴露堆栈跟踪
- ❌ 不要使用通用错误码，要使用具体的

## 核心链路要求

### API 请求处理

所有 API 端点必须：
1. 生成 requestId
2. 创建带 requestId 的 logger
3. 使用 try-catch 处 fanc错误
4. 返回统一的错误响应格式

```typescript
export async function POST(request: Request) {
  const requestId = crypto.randomUUID();
  const logger = createLogger({ requestId, component: 'api' });

  try {
    // 业务逻辑
    return NextResponse.json({ ok: true, data });
  } catch (error) {
    ensureErrorLogged(error, logger);
    return NextResponse.json(
      { ok: false, error: error.message, error_code: error.code },
      { status: 500 }
    );
  }
}
```

### 后台任务处理

所有 Worker 任务必须：
1. 接收 logger 或创建带 taskId 的 logger
2. 记录任务开始和完成
3. 处理任务超时
4. 使用错误边界保护外部调用

```typescript
async function processJob(job: Job, logger: Logger): Promise<void> {
  const jobLogger = logger.child({ taskId: job.id });
  jobLogger.info('Job started');

  try {
    await withRedisErrorBoundary(
      () => processData(job.data),
      jobLogger,
      { operation: 'process_job', task_id: job.id }
    );

    jobLogger.info('Job completed');
  } catch (error) {
    const appError = mapTaskTimeoutError(job.id, 'exceeded', timeoutMs);
    ensureErrorLogged(appError, jobLogger);
    throw appError;
  }
}
```

### 错误响应格式

统一的错误响应格式：

```json
{
  "ok": false,
  "error": "错误消息",
  "error_code": "MODEL_INVOCATION_TIMEOUT",
  "request_id": "req_abc123"
}
```

## 性能考虑

- 使用异步日志避免阻塞
- 高频日志考虑采样
- 避免在日志中输出大型对象
- 生产环境使用 JSON 格式便于解析

## 安全考虑

- 日志中不包含敏感信息（密码、token、完整信用卡号）
- PII 信息需要脱敏
- 错误消息避免暴露内部实现细节
- 生产环境不输出堆栈跟踪

---

# AI Review Pipeline (LangGraph)

PR review 处理流程从两次单 agent LLM 调用，改造成 LangGraph 多 agent 协作 + per-finding 反思循环 + Postgres checkpoint 节点级断点恢复。BullMQ 仍管 job 级重试，LangGraph 管 job 内部图执行。

## 节点拓扑

```
START ─→ quality_reviewer  ─┐
START ─→ security_reviewer ─┴─→ aggregator
                                  │
                                  ├─Send per pending finding──→ critic*
                                  │  (节点内部 while 跑反思循环 verify ↔ regenerate)
                                  │
                                  └─空时──┐
                                          ▼
                                collect_findings ──→ summarizer ──→ END
```

- **quality_reviewer / security_reviewer** 并行扫描；prompt 通过 `ReviewContext.focus` 收敛到各自维度。任一失败仅写 `reviewerErrors`，不阻塞另一路。
- **aggregator** 按 sha256(repositoryId:filePath:startLine:title_en) 去重 + severity desc 排序，初始化 `PerFindingState`。
- **critic** 每条 finding 一个 Send 子任务并行执行；节点**内部** while 循环：verify 通过 → approved；用尽 MAX 次 → exhausted（patchedFinding 兜底）；中间步用 `regenerateFinding` 重写 finding 后再 verify。**MAX_REFLECTION_ATTEMPTS = 2**。
- **collect_findings** 把 perFinding 中 approved + exhausted 合并到 `finalFindings`。
- **summarizer** 看到过滤后的 `finalFindings`，prompt 中注入 verified_findings 块；异常仅 warn，summary=null（与 handler 现状一致）。

> 反思循环刻意放在 critic 节点内部而非图边——LangGraph Send + conditional edge 在每个子任务完成时单独触发出边，会让 router 看到中间态而误派。

## agent_role 枚举

`usage_events.agent_role` 列：
- `quality` / `security`：reviewer 节点对应的 LLM 调用
- `critic`：verifyFinding 调用（task_type = `verify_finding`）
- `regenerator`：regenerateFinding 调用（task_type = `regenerate_finding`）
- `summarizer`：generateReviewSummary（task_type = `review_summary`）

`attempt_number` 列：critic/regenerator 反思循环里的 0-indexed 迭代次数；非反思节点固定为 0。

## Checkpoint

worker 启动时一次性 `PostgresSaver.fromConnString(DATABASE_URL).setup()`，自动建 `checkpoints` / `checkpoint_blobs` / `checkpoint_writes` 三张表（**不写入 `postgres/migrations/`**，由 SDK 自管）。

handler 用 `thread_id = review_run.id` 调 `graph.invoke`。重试同 review_run 时：
- `checkpointer.getTuple({ thread_id })` 有 checkpoint → `graph.invoke(null, config)` 从最近一次写过 checkpoint 的节点续跑
- 没有 checkpoint → `graph.invoke(initial, config)` 首跑

worker 进程在 shutdown 时 `await checkpointer.end()`。

ctx-cache（`packages/ai/src/graph/ctx-cache.ts`）是进程内 `Map<reviewRunId, {diffs, guidelines, projectContext}>`，让大对象不进 LangGraph state（避免 checkpoint 表膨胀）。worker 重启后由 handler 重新加载并 `setCtx`，再通过 `graph.invoke(null)` 续跑。

## 边界

- 图只产出 `finalFindings[]` + `summary`，**不写业务表、不调 PR 平台 API**。所有持久化 / 评论回写仍在 handler 图外完成。
- BullMQ 管 job 级重试 / 并发 / 死信；LangGraph 管 job 内部图执行 + checkpoint。**不要让 LangGraph 替代 BullMQ**。

## 巡检建议

- 监控 checkpoint 表大小：`select pg_size_pretty(pg_total_relation_size('checkpoints'));`
- 必要时 cron 清理 30 天前已 succeeded/failed 的 thread checkpoint
- 反思命中率分析：`select agent_role, attempt_number, success, count(*) from usage_events where review_run_id = $1 group by 1,2,3;`
- 多 agent 调用成本：`select agent_role, sum(estimated_cost) from usage_events where occurred_at > now() - interval '7 day' group by 1;`
