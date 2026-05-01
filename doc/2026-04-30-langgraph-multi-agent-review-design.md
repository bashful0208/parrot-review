# LangGraph 多 agent + checkpoint 改造 review pipeline

## Context

当前 `apps/worker/src/handlers/review.ts` 的步骤 8b/8c 把整条 review 当成两次单 agent LLM 调用（findings + summary），存在三个限制：

1. 行级 finding 由"找问题 + 写 IDE 修复指令"一次 LLM 完成，注意力被稀释，prompt 难独立优化。
2. 没有"二次校验"或反思循环，模型一旦输出错误 / 噪声 finding，缺乏自动纠偏能力。
3. 整个 review_run 是 BullMQ 单 job 黑盒；如果跑到一半挂掉只能整体重跑，浪费 token。

要做的事：把 step 8b 拆成 **多 agent 协作 + per-finding 反思循环**，并通过 LangGraph 的 Postgres checkpoint 实现节点级断点恢复。BullMQ 仍管 job 级重试，LangGraph 管 job 内部图执行。

预期收益：
- quality / security 两条独立 agent，prompt 各自专精。
- 每条 finding 走 critic ↔ regenerator 反思循环（最多 2 次），用尽兜底 critic 修正版。
- worker 重启 / job 重试时从最后 checkpoint 续跑，不重复调 LLM。
- 后续要加 RAG / 多模型 / 多 reviewer 时只是新增节点，不改架构。

## 范围（必须 / 不必须）

**Phase 1 必须**：
- LangGraph 主图：quality_reviewer + security_reviewer 并行 → aggregator → per-finding 子图（critic ↔ regenerator）→ collect_findings → summarizer
- Postgres checkpoint，thread_id = review_run.id
- adapter 新增 `verifyFinding` / `regenerateFinding`，扩 `generateReviewFindings(focus)` / `generateReviewSummary(finalFindings)`
- usage_events 新增 `agent_role` + `attempt_number` 两列
- review_runs 新增 `graph_thread_id` 冗余列
- 测试：节点函数纯函数级单测 + 一条端到端图测试（mock adapter）

**Phase 1 不做**（留给后续）：
- agent ↔ model 多对多配置（`ai_provider_configs` 不动）
- replay UI / time-travel 调试接口
- checkpoint 清理 cron
- 监控 / LangSmith 接入
- RAG retrieval step

## 目标架构

```
worker handleReviewJob (BullMQ job)
  ├─ 步骤 2-7   load repo / pr / diffs / guidelines / projectContext
  ├─ 步骤 7b ★ setCtx(reviewRunId, fullCtx)        // 新增 ctx-cache 预填
  ├─ 步骤 8     getActiveAiProviderConfig
  ├─ 步骤 8b ★ reviewGraph.invoke({...} | null,    // 新增：图执行
  │              { configurable: { thread_id: reviewRunId, checkpoint_ns: "review_v1" } })
  │
  │             图内部：
  │             ┌─→ quality_reviewer  ──┐
  │             └─→ security_reviewer ──┴─→ aggregator
  │                                          │ (Send fan-out per finding)
  │                                          ▼
  │                  ┌──────────────────────────────────┐
  │                  │ critic ─valid?─yes─→ collect     │
  │                  │   ↑              │               │
  │                  │   │            no/exhausted     │
  │                  │   │              ▼               │
  │                  │ regenerator ←────┘               │
  │                  └──────────────────────────────────┘
  │                                          │
  │                                          ▼
  │                                    summarizer → END
  │
  ├─ 步骤 8c ★ clearCtx(reviewRunId)
  ├─ 步骤 9    fingerprint + insertReviewIssues (state.finalFindings)
  ├─ 步骤 10   写 PR summary 评论 (state.summary)
  ├─ 步骤 11   逐条写行内评论
  ├─ 步骤 12   updateReviewRun(succeeded)
  └─ 步骤 13   markWebhookEventStatus(processed)
```

**边界**：图只产出 `finalFindings[]` + `summary`，不写业务表、不调 PR 平台 API。所有持久化和外部副作用仍在 handler 图外完成。

## State Schema

新建 `packages/ai/src/graph/state.ts`：

```ts
import { Annotation } from "@langchain/langgraph";

export interface PerFindingState {
  finding: ReviewFinding;
  attempts: number;
  lastCritique: CritiqueResult | null;
  status: "pending" | "approved" | "exhausted";
}

export interface CritiqueResult {
  valid: boolean;
  reason: string;
  patchedFinding?: ReviewFinding; // exhausted 时兜底用
  confidenceScore: number;
}

export const ReviewGraphState = Annotation.Root({
  reviewRunId: Annotation<string>({ reducer: overwrite, default: () => "" }),
  context: Annotation<ReviewContextRef>({ reducer: overwrite, default: ()=>({}) }),

  draftFindings: Annotation<ReviewFinding[]>({ reducer: appendArray, default: () => [] }),
  reviewerErrors: Annotation<{ role: string; error: string }[]>({ reducer: appendArray, default: () => [] }),

  aggregatedFindings: Annotation<ReviewFinding[]>({ reducer: overwrite, default: () => [] }),
  perFinding: Annotation<Record<string, PerFindingState>>({ reducer: mergeMap, default: () => ({}) }),

  finalFindings: Annotation<ReviewFinding[]>({ reducer: overwrite, default: () => [] }),
  summary: Annotation<ReviewSummary | null>({ reducer: overwrite, default: () => null }),
});
```

**不入 state**：`diffs[]` / `guidelines` / `projectContext` 走 ctx-cache（in-memory Map by reviewRunId），节点函数从 cache 取；worker 重启后由 handler 在续跑前重新 setCtx。

**Per-finding stable key**：`sha256(${repositoryId}:${filePath}:${startLine}:${title_en})` — 与现有 `handlers/review.ts:198` `review_issues.fingerprint` 算法对齐。

## 节点定义

新建 `packages/ai/src/graph/nodes/`：

| 节点 | 文件 | LLM | 复用 / 新增 |
|---|---|---|---|
| `quality_reviewer` | `nodes/reviewer.ts` | ✓ | 复用 `adapter.generateReviewFindings`，加 `focus: "quality"` 参数收敛 prompt |
| `security_reviewer` | `nodes/reviewer.ts` | ✓ | 同上，`focus: "security"` |
| `aggregator` | `nodes/aggregator.ts` | ✗ | 纯逻辑：去重 / 排序 / 初始化 perFinding |
| `critic` | `nodes/critic.ts` | ✓ | 新增 `adapter.verifyFinding(finding, ctx) → CritiqueResult` |
| `regenerator` | `nodes/regenerator.ts` | ✓ | 新增 `adapter.regenerateFinding(finding, critique, ctx) → ReviewFinding` |
| `collect_findings` | `nodes/collect.ts` | ✗ | 纯逻辑：approved + exhausted（兜底用 patchedFinding）合并到 finalFindings |
| `summarizer` | `nodes/summarizer.ts` | ✓ | 复用 `adapter.generateReviewSummary`，加 `finalFindings` 参数注入 prompt |

每个节点都是 `(state, config) => Partial<State>` 纯函数，便于单测。

### Adapter 改动（`packages/ai/src/adapter.ts`）

四个方法在 `AnthropicAdapter` 和 `OpenAICompatibleAdapter` 各实现一遍。全部复用现有的：
- `withUsageInstrumentation`（`packages/ai/src/usage.ts`）
- `classifyAiError`（`packages/ai/src/error-classifier.ts`）
- `validateAndNormalizeFindings` / `validateAndNormalizeSummary`
- `MAX_DIFF_CHARS` / `buildDiffText`

| 方法 | 状态 |
|---|---|
| `generateReviewFindings(ctx, focus?)` | 改：加 `focus: "quality" \| "security"` 收敛 prompt，schema 不变 |
| `verifyFinding(finding, ctx)` | 新：返回 CritiqueResult（valid + reason + patchedFinding + score）|
| `regenerateFinding(finding, critique, ctx)` | 新：拿 critique 重写单条 finding |
| `generateReviewSummary(ctx, finalFindings)` | 改：注入过滤后 findings 列表到 prompt |

新增的两个方法各自需要新 tool schema（`VERIFY_SCHEMA` / `REGENERATE_SCHEMA`），跟 `FINDINGS_SCHEMA` 同结构风格。

### usage 治理

`packages/ai/src/usage.ts` 的 `UsageContext` 加两字段：

```ts
export interface UsageContext {
  // ...现有字段
  agentRole?: "quality" | "security" | "aggregator" | "critic" | "regenerator" | "summarizer";
  attemptNumber?: number; // 反思循环里的 0-indexed 重试号
}
```

`packages/core/src/repositories/usage-event.ts` 的 `UsageEventDraft` 同步加两字段，`insertUsageEvent` 写到新列。

## Per-finding 子图（Send + 循环）

在 `packages/ai/src/graph/index.ts` 组装：

```ts
const fanOutFindings = (s: typeof ReviewGraphState.State) => {
  const pending = Object.entries(s.perFinding).filter(([_, ps]) => ps.status === "pending");
  if (pending.length === 0) return "summarizer";
  return pending.map(([key, ps]) => new Send("critic", {
    findingKey: key, finding: ps.finding, attempts: 0, reviewRunId: s.reviewRunId,
  }));
};

const findingRouter = (s: PerFindingState): "regenerator" | "collect_findings" => {
  if (s.lastCritique?.valid) return "collect_findings";
  if (s.attempts >= 2) return "collect_findings"; // exhausted
  return "regenerator";
};

graph
  .addNode("quality_reviewer", qualityReviewer)
  .addNode("security_reviewer", securityReviewer)
  .addNode("aggregator", aggregator)
  .addNode("critic", critic)
  .addNode("regenerator", regenerator)
  .addNode("collect_findings", collectFindings)
  .addNode("summarizer", summarizer)
  .addEdge(START, "quality_reviewer")
  .addEdge(START, "security_reviewer")
  .addEdge("quality_reviewer", "aggregator")
  .addEdge("security_reviewer", "aggregator")
  .addConditionalEdges("aggregator", fanOutFindings, ["critic", "summarizer"])
  .addConditionalEdges("critic", findingRouter, {
    regenerator: "regenerator",
    collect_findings: "collect_findings",
  })
  .addEdge("regenerator", "critic")
  .addEdge("collect_findings", "summarizer")
  .addEdge("summarizer", END);
```

**MAX_RETRIES = 2** 在 `findingRouter` 硬编码（不通过 LLM 控制）；超限时 `critic` 节点写 `status="exhausted"` + 保留 `lastCritique.patchedFinding`，由 `collect_findings` 兜底。

**并发控制**：图层不限并发，由 adapter 层 p-limit 包住底层 LLM 调用，避免打爆 provider rate limit。

## Checkpoint

`apps/worker/src/index.ts` 新增 worker 启动期单例：

```ts
import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";
const checkpointer = PostgresSaver.fromConnString(env.DATABASE_URL!);
await checkpointer.setup(); // SDK 自动建 checkpoints / checkpoint_blobs / checkpoint_writes
```

`graph.compile({ checkpointer })`，`thread_id = review_run.id`，`checkpoint_ns = "review_v1"`。

handler 的续跑判断：
```ts
const existing = await checkpointer.getTuple(config);
if (existing && existing.checkpoint?.v) {
  // ctx-cache 已 setCtx，直接续
  result = await graph.invoke(null, config);
} else {
  result = await graph.invoke(initialState, config);
}
```

worker shutdown 时 `await checkpointer.end()`。

**LangGraph 的三张 checkpoint 表不写入 `postgres/migrations/`**，由 SDK 在 worker 启动时 `setup()` 幂等创建。

## DB 迁移

新建两个迁移文件：

`postgres/migrations/0006_usage_events_agent_columns.sql`：
```sql
ALTER TABLE usage_events
  ADD COLUMN IF NOT EXISTS agent_role text,
  ADD COLUMN IF NOT EXISTS attempt_number integer NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_usage_events_review_run_agent
  ON usage_events (review_run_id, agent_role);
```

`postgres/migrations/0007_review_runs_graph_thread.sql`：
```sql
ALTER TABLE review_runs
  ADD COLUMN IF NOT EXISTS graph_thread_id text;
CREATE INDEX IF NOT EXISTS idx_review_runs_graph_thread
  ON review_runs (graph_thread_id);
```

两个 ALTER 都是 `ADD COLUMN IF NOT EXISTS` + 默认值，向下兼容。

`ai_provider_configs` 不动（agent 全用同一 active config）；`review_issues` 不动（fingerprint 与 graph 内 findingKey 等价）。

## Handler 集成（`apps/worker/src/handlers/review.ts`）

旧的步骤 8b/8c 改为：

```ts
// 步骤 7b: 预填 ctx-cache
setCtx(runId!, { diffs, guidelines, projectContext });

try {
  // 步骤 8: getActiveAiProviderConfig（不变）
  const adapterConfig = ...;
  const adapter = createAdapter(adapterConfig, usageRecorder);

  // 步骤 8a: 编译图（worker 启动时已 compile，handler 复用）
  const config = {
    configurable: {
      thread_id: runId!,
      checkpoint_ns: "review_v1",
    },
    metadata: { reviewRunId: runId, repositoryId, pullRequestId },
  };

  // 步骤 8b: 续跑判断 + invoke
  const existing = await checkpointer.getTuple(config);
  const initial = {
    reviewRunId: runId!,
    context: { fullName: repo.full_name, prNumber, headSha, organizationId,
               repositoryId, pullRequestId, providerConfigId: adapterConfig.id },
  };
  const result = existing?.checkpoint?.v
    ? await reviewGraph.invoke(null, config)
    : await reviewGraph.invoke(initial, config);

  const finalFindings = result.finalFindings;
  const summaryMd = result.summary
    ? renderBilingualSummary(result.summary)
    : null;

  // 步骤 9-13: 不变（fingerprint / 写库 / 回写评论 / 标 succeeded）
  // ...
} finally {
  clearCtx(runId!); // 不论成败清缓存
}
```

handler 失败兜底（保持现状）：图 invoke 抛异常 → catch → updateReviewRun(failed) → markWebhookEventStatus(failed) → BullMQ 自动重试时同 thread_id 自动续跑。

`graph_thread_id` 在 `createReviewRun` 时一并写入（值就是 review_run.id 自身，冗余存一列方便 join checkpoints 表）。

## 错误 / 失败处理

| 场景 | 行为 |
|---|---|
| quality_reviewer 异常 | 节点 catch，写 `reviewerErrors`，不阻塞 security_reviewer / 后续 aggregator |
| security_reviewer 异常 | 同上 |
| 两个 reviewer 都失败 | aggregator 拿到空 draftFindings → fanOutFindings 直接到 summarizer → finalFindings=[] → handler 写 0 个 issue，但 review_run 仍标 succeeded（与现状一致：review 完成但没找到问题） |
| critic / regenerator 单次抛异常 | 节点内部不 catch，整个图 invoke 抛 → handler catch → updateReviewRun(failed) → BullMQ 重试时从 checkpoint 续跑（不重跑前面的 reviewer / aggregator） |
| summarizer 异常 | 节点 catch，summary=null，graph 正常返回（与现状步骤 8c 行为一致）|
| LangGraph 超过 recursion_limit | invoke 抛 GraphRecursionError → handler catch → 标 failed |

## 测试策略

测试框架沿用 `tsx --test`（与现有 `packages/ai/src/*.test.{mjs,ts}` 一致）。

**单元测试（必须）**：

| 文件 | 覆盖 |
|---|---|
| `packages/ai/src/graph/nodes/aggregator.test.ts` | 去重 / 排序 / perFinding 初始化 |
| `packages/ai/src/graph/nodes/critic.test.ts` | mock adapter，valid / invalid 两路输出 |
| `packages/ai/src/graph/nodes/regenerator.test.ts` | mock adapter，注入 critique 后输出形状 |
| `packages/ai/src/graph/nodes/collect.test.ts` | approved / exhausted 兜底逻辑 |
| `packages/ai/src/graph/router.test.ts` | findingRouter 三分支：valid / attempts<MAX / attempts>=MAX |
| `packages/ai/src/graph/state.test.ts` | reducer 行为：appendArray / mergeMap / overwrite |

**端到端图测试（必须）**：

`packages/ai/src/graph/graph.integration.test.ts`：
- mock adapter 全套 4 个方法
- 用 MemorySaver（不依赖 PG）
- 跑 3 个 fixture 场景：
  1. 全部 finding 一次过 critic（验主路径）
  2. 1 条 finding 第二次过 critic（验循环）
  3. 1 条 finding 用尽重试走 exhausted 兜底（验 patchedFinding）
- 断言 finalFindings 数量、summary 非空、reducer 合并正确

**Handler 集成测试**：
- 现有 `apps/worker/src/handlers/*.test.ts` 增加一条用 MemorySaver 的 case，验"图调用 + 图外写库"边界

**不在 Phase 1 测的**：
- 真实 PG checkpoint 持久化（手动验证 + 后续补 integration test）
- recursion_limit 触发
- adapter 层 rate limit / p-limit 行为

## 渐进引入路径

按以下顺序提交，每步可独立 review / merge：

1. **PR-1: schema 迁移**
   - 0006、0007 migration
   - `UsageEventDraft` / `UsageContext` 加字段（向下兼容默认值）
   - 不动业务逻辑，跑得起来即可
2. **PR-2: adapter 新方法**
   - `verifyFinding` / `regenerateFinding` 在 Anthropic + OpenAI 两个 adapter 实现
   - `generateReviewFindings(focus)` / `generateReviewSummary(finalFindings)` 改签名（向下兼容）
   - 单测覆盖到位；handler 暂不调用
3. **PR-3: 图骨架（不接入 handler）**
   - `packages/ai/src/graph/` 新建：state / nodes / index.ts / ctx-cache
   - 装 `@langchain/langgraph` + `@langchain/langgraph-checkpoint-postgres`
   - 端到端图测试用 MemorySaver 跑通
4. **PR-4: handler 切流量**
   - `apps/worker/src/index.ts` 新增 PostgresSaver 单例 + setup()
   - `apps/worker/src/handlers/review.ts` 步骤 8b 切到 graph.invoke
   - 通过环境变量 `REVIEW_GRAPH_ENABLED=1` 控制开关，默认开新流程，可一键回退老流程
   - 老的 `generateReviewFindings` / `generateReviewSummary` 直接调用代码暂不删除（PR-5 清理）
5. **PR-5: 清理 + 文档**
   - 移除 handler 里老的直接调用代码 + REVIEW_GRAPH_ENABLED 开关
   - 更新 `pattern.md` / `docs/` 关键说明：图节点拓扑、checkpoint 巡检建议、agent_role 枚举

每个 PR 各自跑 `pnpm check`（lint + typecheck + test）。

## 关键文件清单（实施时需要触碰的位置）

**新增**：
- `packages/ai/src/graph/state.ts` — Annotation.Root + reducers + PerFindingState
- `packages/ai/src/graph/ctx-cache.ts` — in-memory Map by reviewRunId
- `packages/ai/src/graph/nodes/reviewer.ts` — quality / security 共用模板，按 focus 分流
- `packages/ai/src/graph/nodes/aggregator.ts`
- `packages/ai/src/graph/nodes/critic.ts`
- `packages/ai/src/graph/nodes/regenerator.ts`
- `packages/ai/src/graph/nodes/collect.ts`
- `packages/ai/src/graph/nodes/summarizer.ts`
- `packages/ai/src/graph/router.ts` — findingRouter / fanOutFindings
- `packages/ai/src/graph/index.ts` — graph 组装 + compile 工厂（接收 checkpointer）
- 对应 `*.test.ts` / `graph.integration.test.ts`
- `postgres/migrations/0006_usage_events_agent_columns.sql`
- `postgres/migrations/0007_review_runs_graph_thread.sql`

**修改**：
- `packages/ai/src/adapter.ts`（726 → ~900 行）— 加 4 个方法、新 tool schema、prompt focus 收敛
- `packages/ai/src/usage.ts` — `UsageContext` 加 `agentRole` / `attemptNumber`
- `packages/ai/src/types.ts` — 导出 PerFindingState / CritiqueResult / ReviewContextRef
- `packages/ai/src/index.ts` — 导出图工厂 + 类型
- `packages/ai/package.json` — `@langchain/langgraph` + `@langchain/langgraph-checkpoint-postgres` + `@langchain/core`
- `packages/core/src/repositories/usage-event.ts` — `UsageEventDraft` + insert SQL 加两列
- `packages/core/src/repositories/review-run.ts` — `createReviewRun` 写 graph_thread_id
- `apps/worker/src/index.ts` — 启动 checkpointer 单例 + 编译图、注入 handler
- `apps/worker/src/handlers/review.ts` — 步骤 8b/8c 改 graph.invoke + 续跑判断 + ctx-cache 生命周期

**不动**：
- `apps/web/**` — webhook 入口完全不受影响
- `packages/git/**`、`packages/shared/**`
- `ai_provider_configs` / `review_issues` / `review_comments` / `webhook_events`

## 复用清单（已存在、不要重写）

| 已有 | 路径 | 复用方式 |
|---|---|---|
| `loadReviewerGuidelines` | `packages/ai/src/context.ts:61` | handler 步骤 7a 已调用，结果送进 ctx-cache |
| `loadTargetRepoContext` | `packages/ai/src/context.ts:109` | 同上 |
| `withUsageInstrumentation` | `packages/ai/src/usage.ts` | 包住每个新 adapter 方法 |
| `classifyAiError` | `packages/ai/src/error-classifier.ts` | 由 `withUsageInstrumentation` 内部已调用，无需 node 层处理 |
| `MAX_DIFF_CHARS` / `buildDiffText` | `packages/ai/src/adapter.ts:76,154` | reviewer 节点内部仍走它 |
| `validateAndNormalizeFindings` / `validateAndNormalizeSummary` | `packages/ai/src/adapter.ts:183,301` | 不变 |
| `FINDINGS_SCHEMA` / `SUMMARY_SCHEMA` | `packages/ai/src/adapter.ts:78,102` | 不变（reviewer / summarizer 仍用） |
| `createAdapter` | `packages/ai/src/adapter.ts:704` | handler 仍调，注入 usageRecorder 不变 |
| `noopUsageRecorder` / `UsageRecorder` | `packages/ai/src/usage.ts` | 测试 mock 用 |
| `renderBilingualFinding` / `renderBilingualSummary` | `packages/ai/src/render.ts` | handler 步骤 10/11 仍用 |
| 现有 fingerprint 算法 | `apps/worker/src/handlers/review.ts:198` | findingKey 用同一公式（迁移到 graph/state.ts 时复用） |

## 验证

**端到端验证**（按顺序）：

1. PR-1 后：`pnpm --dir postgres run migrate` → `pnpm typecheck` → `pnpm test`，确认两个 ALTER 跑通且老代码跑得起来。
2. PR-2 后：`pnpm --dir packages/ai run test`，新 adapter 方法单测全通过。
3. PR-3 后：`pnpm --dir packages/ai run test`，含端到端图测试（MemorySaver fixtures），核对 finalFindings 与三种场景一致。
4. PR-4 后：
   - 启动 worker（`pnpm --dir apps/worker run dev`），看日志有 `PostgresSaver setup completed`。
   - `psql $DATABASE_URL -c "\dt"` 确认 `checkpoints` / `checkpoint_blobs` / `checkpoint_writes` 三张表存在。
   - 在 staging GitHub repo 推一个 PR 触发 webhook → review_run 表 `graph_thread_id` 写入；`usage_events` 出现多条 `agent_role` 不同的记录（quality / security / critic / summarizer）。
   - 主动 `kill -9` worker（review 跑到 critic 阶段），重启后看日志 "Resuming from checkpoint at node=critic"，且 `usage_events` 中 reviewer 节点的调用不重复出现。
5. PR-5 后：`pnpm check` 全绿；老路径代码已删除；`pattern.md` 含图拓扑说明。

**指标观察**（PR-4 部署 1 周后）：
- `usage_events` 按 `(agent_role, success)` group：critic 通过率（attempt_number=0 vs 1）→ 看反思的边际收益
- `review_runs` 按 `status` 分布是否有变化（multi-agent 是否引入新失败模式）
- 平均 review_run 总 token 消耗（与 v1 单 agent 流程对比，预期上涨 2~3 倍）
