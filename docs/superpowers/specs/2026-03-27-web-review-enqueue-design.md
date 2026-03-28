# 2026-03-27 Web Review Enqueue Design

## Context

当前仓库已经有两个独立服务：

- `apps/web`：Next.js 16 前端工程
- `apps/worker`：BullMQ + Redis 的后台 Worker

目前 `apps/worker` 已经可以通过真实 Redis 消费 `review-jobs` 队列里的任务，也已经有自动化集成测试证明 queue → worker 的消费链路有效。

本次设计目标是在 `apps/web` 中补一个最小可用的 Web 入队入口，让用户可以从首页点击按钮，调用后端接口，将一条占位 review job 放进 Redis 队列，并把结果显示在页面上。

## Goals

- 在 `apps/web` 首页提供一个可点击按钮
- 点击后调用后端 HTTP 入口完成入队
- 默认写入 `review-jobs` 队列
- 页面展示最小成功/失败结果
- 与现有 `apps/worker` 保持兼容，让已运行的 worker 可以消费这条 job

## Non-Goals

- 不做实时消费状态追踪
- 不做 SSE / WebSocket / 轮询
- 不做复杂表单或自定义 payload 编辑器
- 不做完整鉴权、权限控制或多租户隔离
- 不在本轮抽象成跨服务共享 package

## Recommended Approach

采用 `Route Handler + 首页按钮` 的方式实现：

1. 在 `apps/web` 首页放一个按钮，负责触发一次入队请求并展示返回结果。
2. 在 `apps/web` 新增 `POST /api/reviews/enqueue`，作为 Web 侧最小入队 HTTP 入口。
3. 把 BullMQ 入队逻辑封装到 web 侧一个小型 helper 中，避免页面组件或 `Route Handler` 直接堆积连接和队列细节。
4. 默认使用环境变量 `REDIS_URL` 和 `REVIEW_QUEUE_NAME`；若未提供队列名，则回退到 `review-jobs`。
5. 返回最小 JSON 结果，包含 `ok`、job id、job name、queue name，供首页展示。

这个方案比 Server Action 多一层，但 HTTP 边界更清晰，后续 CLI、Webhook、其他页面或第三方调用都可以复用这个入队接口。

## Architecture

### UI Layer

首页负责三件事：

- 展示一个“Enqueue Review Job”按钮
- 请求发送时展示 loading 状态，避免重复点击
- 展示接口返回的成功或失败结果

页面层不直接依赖 Redis 或 BullMQ，只与浏览器端 `fetch()` 和接口 JSON 结果交互。

### HTTP Layer

`Route Handler` 负责：

- 接收 `POST` 请求
- 调用 enqueue helper 执行真正的入队
- 把成功/失败转换成稳定 JSON 响应

它是前端与队列系统之间的边界层，也是未来复用的统一 HTTP 入口。

### Queue Layer

web 侧 helper 负责：

- 读取 `REDIS_URL`
- 读取 `REVIEW_QUEUE_NAME`，默认回退到 `review-jobs`
- 创建 BullMQ `Queue`
- `add()` 一条占位 job
- 返回最小 job 元信息
- 关闭连接，避免请求结束后泄漏资源

这个 helper 只服务“在 Web 侧新增任务”，不负责消费，也不耦合 UI。

## File Plan

建议新增或修改以下文件：

- `apps/web/src/app/page.tsx`
  - 新增按钮、加载状态、结果展示
- `apps/web/src/app/api/reviews/enqueue/route.ts`
  - 实现 `POST` 接口
- `apps/web/src/lib/review-queue.ts`
  - 封装 Redis/BullMQ 入队逻辑
- `apps/web/package.json`
  - 如 web 尚未安装 `bullmq`、`ioredis`，补充最小依赖

## Data Flow

1. 用户打开首页并点击按钮
2. 浏览器发起 `POST /api/reviews/enqueue`
3. `Route Handler` 调用 `review-queue` helper
4. helper 连接 Redis 并向 `review-jobs` 添加一条 job
5. helper 返回 job 元数据给 `Route Handler`
6. `Route Handler` 返回 JSON 给前端
7. 页面展示成功或失败结果
8. 已运行的 `apps/worker` 消费这条 job

## API Contract

### Success Response

```json
{
  "ok": true,
  "job": {
    "id": "123",
    "name": "manual-review",
    "queue": "review-jobs"
  }
}
```

### Error Response

```json
{
  "ok": false,
  "error": "REDIS_URL is not configured"
}
```

### Job Shape

第一版 job 可以保持极简，例如：

- name: `manual-review`
- data: `{ source: "web" }`

这样已经足够证明 Web → Redis → Worker 的链路打通。

## Error Handling

- `REDIS_URL` 缺失：返回 `500` 和明确文案
- Redis 连接失败：返回 `500`
- BullMQ `add()` 失败：返回 `500`
- 页面只展示可读错误信息，不暴露底层 stack
- 请求发送期间按钮禁用，避免用户重复入队

## Testing Strategy

### Automated

优先补最小自动化覆盖：

- web 侧 helper 的单测，验证配置读取与返回结构
- 如当前 web 工程没有测试基建，则本轮可只做最小代码级验证，不额外引入重量级测试体系

### Manual Verification

手动验证作为这轮核心验收方式：

1. 启动 `apps/worker`，确保它连接真实 Redis
2. 启动 `apps/web`
3. 打开首页点击按钮
4. 观察页面返回 job id / queue name
5. 观察 worker 日志确认该 job 被消费

## Success Criteria

以下条件同时满足则认为完成：

- 首页存在可点击按钮
- 点击后触发 HTTP 入队请求
- 接口成功返回 job 元信息
- job 进入 `review-jobs`
- 已启动 worker 能消费该 job
- 页面可显示成功或失败结果

## Trade-offs

### Why not Server Action

Server Action 文件更少，但当前需求本质上是“给 Web 提供一个可复用入队入口”。HTTP 接口的复用边界更明确，也更适合后续外部触发场景。

### Why not poll job status now

当前目标是先证明 Web 能真实入队；如果现在加入状态查询、轮询或实时推送，会把范围从“最小入口”扩大成“任务状态系统”。

## Open Questions Resolved

- 触发方式：采用首页按钮
- 后端边界：采用 `Route Handler`
- 返回内容：最小成功/失败 JSON
- worker 兼容性：沿用现有 `review-jobs` 和占位处理器

## Implementation Notes

实现时应尽量保持最小改动：

- 不重构现有 worker 架构
- 不把 Web 和 Worker 提前抽成共享 package
- 不引入与当前目标无关的新基础设施

后续如果要扩展为真实 PR 审查任务，再在这个 HTTP 入口基础上逐步增加 payload、鉴权、状态查询与任务详情能力。
