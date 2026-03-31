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
