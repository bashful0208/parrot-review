# PR 审查完整流程分析

## 一、触发入口（两种方式）

### 方式 A：Webhook（主要自动化路径）

```
GitHub/Gitee PR 事件 (opened / synchronize / reopened)
  → POST /api/webhooks/{github,gitee}
  → 提取 providerRepoId → 查库找到对应仓库集成
  → 验证 HMAC 签名 → 归一化为 NormalizedWebhookEvent
  → 写 webhook_events 表（按 deliveryId 去重）
  → 入队 BullMQ 任务到 Redis 队列 "review-jobs"
```

**Webhook 处理关键文件：**

| 文件 | 作用 |
|------|------|
| `apps/web/src/app/api/webhooks/github/route.ts` | GitHub webhook 端点 |
| `apps/web/src/app/api/webhooks/gitee/route.ts` | Gitee webhook 端点 |
| `apps/web/src/lib/webhooks/process.ts` | 通用 webhook 处理逻辑 |
| `packages/git/src/github/webhook.ts` | GitHub 签名验证 + 事件归一化 |
| `packages/git/src/gitee/webhook.ts` | Gitee 签名验证 + 事件归一化 |
| `packages/core/src/review-queue.ts` | 入队 BullMQ 任务 |

### 方式 B：手动触发

- `POST /api/reviews/enqueue` — 手动调用，目前是占位实现

---

## 二、Worker 处理管道（13 步）

```
handleReviewJob()
├─  1. 加载仓库 + 解密凭证 (getRepositoryWithCredential)
├─  2. 构建 Git Provider 实例 (GitHubProvider / GiteeProvider)
├─  3. 调用 Git API 获取 PR 元数据
├─  4. upsert pull_requests 表 (on conflict do update)
├─  5. 解析输出语言 (org 级别设置，默认 zh-CN)
├─  6. 创建 review_runs 行 (status=queued)
├─  7. 更新 review_runs 为 running
├─  8. 首次运行发 "Big Brother is watching" 评论
├─  9. 获取 PR diff (FileDiff[])
├─ 10. 并发加载审查指南 + 目标仓库上下文
│      - 本地: CLAUDE.md / AGENTS.md / pattern.md / README.md
│      - 目标仓库: 同样 4 个文件
├─ 11. 加载活跃 AI 提供商配置 (加密存储的 API key + model)
├─ 12. 创建用量记录器 (写入 usage_events)
└─ 13. 执行 LangGraph 审查图
```

**关键文件：**

| 文件 | 作用 |
|------|------|
| `apps/worker/src/index.ts` | Worker 入口，初始化 BullMQ + PostgresSaver |
| `apps/worker/src/handlers/review.ts` | 核心审查任务处理函数 |

---

## 三、AI 审查图（LangGraph StateGraph）

### 3.1 图拓扑

```
                         ┌─ quality_reviewer ──────────┐
START ──┤── security_reviewer ──────────┤── aggregator ──┐
                         └─ error_handler_reviewer ────┘                │
                                                                                         │
               ┌─────────────────────────────────────────────────────────┘
               ▼
     fanOutFindings（路由判断）
        ├─ 有待审 finding → 并行 Send 给 critic（每条一个）
        │     └─ critic: while 循环（最多 MAX_REFLECTION_ATTEMPTS=2 轮）
        │           ├─ verifyFinding → valid=true → approved
        │           └─ verifyFinding → valid=false → regenerateFinding → 重试
        │                                           └─ 用尽 → exhausted（回退到 patchedFinding）
        └─ 无待审 finding → 直接 collect_findings
               ▼
     collect_findings（收集 approved + exhausted）
               ▼
     summarizer（生成最终审查摘要）
               ▼
             END
```

### 3.2 三个并行审查员

| 审查员 | focus | 置信度阈值 | 特点 |
|--------|-------|-----------|------|
| quality_reviewer | quality | 0.8 | 通用代码质量 |
| security_reviewer | security | 0（不过滤） | 安全漏洞检测 |
| error_handler_reviewer | error_handling | 0.7 | 先做确定性正则预扫描，再把结果注入 LLM prompt |

**error_handler 预扫描（确定性，不调 LLM）：**
- 空 catch 块
- 宽泛捕获模式 (catch Exception / Throwable)
- catch 块内日志降级
- 不可操作的错误消息

预扫结果格式化为 XML 注入后续 LLM 审查 prompt。

### 3.3 关键节点

| 节点 | 文件 | 职责 |
|------|------|------|
| reviewer | `packages/ai/src/graph/nodes/reviewer.ts` | 工厂函数 `makeReviewerNode(focus, adapter)` |
| error-handler-scanner | `packages/ai/src/graph/nodes/error-handler-scanner.ts` | 确定性正则预扫描 |
| aggregator | `packages/ai/src/graph/nodes/aggregator.ts` | 指纹去重 + 严重度排序 |
| router | `packages/ai/src/graph/router.ts` | fanOutFindings 条件路由 |
| critic | `packages/ai/src/graph/nodes/critic.ts` | 反思循环（verify→regenerate） |
| collect | `packages/ai/src/graph/nodes/collect.ts` | 收集终审 findings |
| summarizer | `packages/ai/src/graph/nodes/summarizer.ts` | 生成审查摘要 |

### 3.4 关键机制

- **去重**：aggregator 用 `sha256(repo:file:startLine:title_en)` 做指纹去重
- **排序**：critical > high > medium > low，同级别按文件路径
- **反思循环**：critic 内部用 while 循环（不是图的边），崩溃后整个 finding 重来
- **上下文缓存** (`ctx-cache.ts`)：diffs / guidelines 存在外部缓存，不进入 LangGraph checkpoint，保持检查点轻量
- **检查点持久化**：用 PostgresSaver，每个节点输出持久化到 PostgreSQL。Worker 崩溃后重试：
  ```
  existing?.checkpoint ? graph.invoke(null, config)  // 从断点恢复
                       : graph.invoke(initial, config) // 全新执行
  ```

### 3.5 LLM 调用次数估算

一次完整 PR 审查的 LLM 调用量：
- **3 次** 审查员（3 个并行）
- **N × M 次**（N = 发现的 findings 数，M = 反思轮数，最多 2）
- **1 次** summarizer
- **总计**：3 + N×M + 1

### 3.6 审查图构建

- 文件：`packages/ai/src/graph/index.ts`
- 函数：`buildReviewGraph(adapter, checkpointer?)` → 返回编译后的 `StateGraph`

### 3.7 图状态

```typescript
// packages/ai/src/graph/state.ts
- reviewRunId, outputLanguage, context        // overwrite reducer
- draftFindings                               // appendArrayReducer (三个审查员并行写入)
- reviewerErrors                              // appendArrayReducer (错误收集)
- aggregatedFindings                          // overwrite (去重排序后的结果)
- perFinding                                  // mergeMapReducer (key → PerFindingState)
- finalFindings                               // overwrite (最终输出)
- summary, summaryError, criticErrors         // 错误频道
```

### 3.8 AI Adapter 接口

```typescript
// packages/ai/src/adapter.ts
interface AiAdapter {
  generateReviewFindings(context): Promise<ReviewFindingsResult>
  generateReviewSummary(context):  Promise<ReviewSummaryResult>
  verifyFinding(finding, context):  Promise<CritiqueResult>
  regenerateFinding(finding, critique, context): Promise<ReviewFinding>
}
```

两个实现：
- `AnthropicAdapter` — 使用 `@anthropic-ai/sdk`
- `OpenAICompatibleAdapter` — 使用 `openai` SDK（支持阿里云等兼容提供商）

---

## 四、输出与反馈（Worker 管道续）

```
14. 批量写 review_issues 表（fingerprint 去重，on conflict do nothing）
15. 发总结评论到 PR Conversation
16. 逐条发 inline review comment（精确到文件 + 行号）
17. 更新 review_runs → succeeded（含 findings_count、analyzed_files_count、summary_md）
18. 标记 webhook_events → processed
```

### 失败处理

任何步骤失败 → review_run 标记 `failed` → webhook_event 标记 `failed` → 抛出异常让 BullMQ 重试

---

## 五、核心数据模型

### review_runs

| 字段 | 说明 |
|------|------|
| id | UUID 主键 |
| repository_id / organization_id | 关联 |
| provider_pr_id | PR 编号 |
| run_number | 该 PR 的第几次审查（自增） |
| status | queued → running → succeeded / failed / retrying / cancelled |
| head_sha / base_sha | 审查的 commit 范围 |
| diff | 原始 diff 文本 |
| summary_md | 审查摘要（Markdown） |
| findings_count / analyzed_files_count | 统计 |

### review_issues

| 字段 | 说明 |
|------|------|
| fingerprint | `sha256(repo:file:startLine:title_en)` 去重键 |
| file_path / start_line / end_line | 问题位置 |
| issue_type | 问题类型 |
| severity | low / medium / high / critical |
| title_en / title_zh | 双语标题 |
| summary_en / summary_zh | 双语描述 |
| suggestion_en / suggestion_zh | 双语建议 |
| ai_prompt | 审查员原始 prompt（调试用） |
| confidence_score | LLM 置信度 |

### review_comments

| 字段 | 说明 |
|------|------|
| is_inline | true=文件行级评论, false=PR 会话评论 |
| external_comment_id | GitHub/Gitee 上的评论 ID |
| posted | 是否已成功发布 |

---

## 六、整体架构图

```
GitHub/Gitee ──webhook──▶ apps/web (Next.js) ──Redis──▶ apps/worker (BullMQ)
                              │                              │
                              ▼                              │
                         PostgreSQL ◀─────────────────────────┘
                    (业务数据 + LangGraph checkpoints)
                              │
                              ▼
                    ┌─────────────────┐
                    │   AI Providers  │
                    │  Anthropic/OpenAI│
                    └─────────────────┘
```

**架构分层：**

| 层 | 包 | 职责 |
|----|-----|------|
| Web 层 | `apps/web` | Next.js 前端 + API 路由 + Webhook 端点 |
| Worker 层 | `apps/worker` | BullMQ 消费者，协调审查生命周期 |
| AI 层 | `packages/ai` | LangGraph 状态机 + LLM Adapter + Prompt 构建 |
| 核心层 | `packages/core` | 数据库仓库 + 错误处理 + 日志 + 审查队列 |
| Git 层 | `packages/git` | GitHub/Gitee 抽象（API 调用、Webhook 归一化） |
| 共享类型 | `packages/db-types` | 枚举和字符串字面量类型 |

---

## 七、并发能力分析

### BullMQ 并发控制

- 默认队列 `review-jobs`
- 并发数由 Worker 初始化时的 `concurrency` 参数控制（在 `apps/worker/src/index.ts`）
- 每个 job 内部通过 LangGraph 并行执行 3 个审查员 + N 条 findings 的反思

### 瓶颈分析

| 环节 | 瓶颈点 |
|------|--------|
| LLM API 调用 | rate limit / token 消耗（一次审查可能有 10-50+ 次 API 调用） |
| PostgreSQL | PostgresSaver 每个节点写 checkpoint（并发 write 压力） |
| Redis | 队列吞吐量（一般不是瓶颈） |
| Git API | 获取 diff 和 PR 信息（GitHub 5000 req/h for authenticated users） |

### 恢复与可靠性

- BullMQ 支持自动重试（可配置次数和退避策略）
- LangGraph checkpoint 支持断点恢复，不会因中途崩溃导致完成的工作丢失
- Webhook 事件按 deliveryId 去重，避免重复触发
