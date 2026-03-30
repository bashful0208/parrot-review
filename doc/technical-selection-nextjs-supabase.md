# 基于 Next.js + Supabase 的技术选型文档

## 1. 文档目标

为 AI PR 审查产品的 MVP 和首个可商用版本确定一套偏轻量、上线快、后续可扩展的技术方案。

本文只解决三件事：

- 前台控制台和 BFF 怎么做
- 后台异步审查链路怎么做
- 在选择 Supabase 的前提下，哪些能力直接用，哪些能力不要硬塞进去

## 2. 选型结论

### 2.1 总体结论

采用 `Next.js + Supabase + Redis + 独立 Worker` 架构。

- `Next.js` 负责控制台、登录态、配置页、审查结果页、Webhook 接入层
- `Supabase` 负责数据库、鉴权、对象存储、实时推送、定时任务、向量检索
- `Supabase Vault` 负责加密存储大模型密钥
- `Redis` 负责异步任务队列
- `Worker` 负责仓库拉取、diff 分析、规则执行、模型调用、结果回写

这套方案在保留 Supabase 一体化优势的同时，只额外引入一套 Redis 队列，适合 MVP 和首个可商用版本。

### 2.2 最终选型表

| 层       | 选型                                   | 角色                                       |
| -------- | -------------------------------------- | ------------------------------------------ |
| Web      | `Next.js 16 + App Router + TypeScript` | 控制台、BFF、Webhook、管理后台             |
| UI       | `Tailwind CSS + shadcn/ui`             | 后台界面和配置页面                         |
| Auth     | `Supabase Auth + @supabase/ssr`        | 控制台用户登录、组织成员会话               |
| AI 接入  | `Vercel AI SDK`                        | 统一对接 OpenAI / Claude / Qwen 等模型     |
| 密钥存储 | `Supabase Vault + 业务配置表`          | 加密存储模型密钥及其绑定关系               |
| 主数据库 | `Supabase Postgres`                    | 业务主库、多租户数据、规则、评论、任务状态 |
| 队列     | `Redis + BullMQ`                       | PR 审查任务、重试任务、延迟任务、回放任务  |
| 文件存储 | `Supabase Storage`                     | 审查快照、日志、导出文件、附件             |
| 实时更新 | `Supabase Realtime`                    | 审查状态更新、结果推送                     |
| 向量检索 | `pgvector`                             | 知识库、规则语义召回、历史经验检索         |
| 定时任务 | `Supabase Cron`                        | 重试、清理、超时补偿、日报统计             |
| Worker   | `Node.js LTS + TypeScript`             | 长任务执行、Git 操作、模型调用             |
| 本地开发 | `Supabase CLI`                         | 本地数据库、Auth、Storage、迁移、类型生成  |

## 3. 为什么选 Supabase

### 3.1 适合当前阶段

- 你现在更需要的是“尽快把主链路打通”，不是自己组一套基础设施
- Supabase 一次性补齐了 `Postgres + Auth + Storage + Realtime + Cron`
- 队列单独交给 `Redis + BullMQ`，换来更成熟的 Worker 编排能力
- 对 Next.js 支持直接，SSR、Cookie Session、服务端调用都现成

### 3.2 对这个产品特别合适

这个产品本质上有四类数据：

- 业务结构化数据：组织、仓库、PR、评论、规则、反馈
- 异步任务数据：审查任务、补偿任务、重试记录
- 文件和产物：快照、日志、导出文档
- 检索数据：规则语义、知识片段、历史经验 embedding

Supabase 可以覆盖结构化数据、文件产物和检索数据，队列则单独交给 Redis。

这样只多引入一个真正必要的基础设施：异步任务队列。

## 4. 核心架构

### 4.1 架构原则

- `Next.js` 不承担重任务
- 所有 PR 审查都走异步链路
- 浏览器只访问受 RLS 保护的数据
- `service_role` 只允许在服务端和 Worker 使用
- 模型密钥存储在数据库中，但必须使用加密 secret 存储而不是明文字段
- 先单库单队列，后面再拆

### 4.2 架构图

```txt
GitHub / GitLab / Gitee
        |
        v
Next.js Route Handlers
        |
        v
Supabase Postgres
        |
        +--> Redis + BullMQ
        |
        v
Worker
  - 拉仓库
  - 分析 diff
  - 执行规则
  - 调用模型
  - 写回结果
        |
        v
Supabase Postgres / Storage
        |
        +--> Realtime 推送到 Next.js 控制台
```

## 5. 分层选型

### 5.1 Web 层：Next.js

选型：

- `Next.js 16`
- `App Router`
- `TypeScript`
- 默认 `Server Components`
- 交互区使用 `Client Components`
- `Route Handlers` 处理 Webhook 和 BFF 接口
- `Server Actions` 处理规则保存、评论忽略、任务重跑等后台写操作

这样拆的原因：

- 控制台页面以服务端读数据为主，天然适合 Server Components
- Webhook 和后台操作适合走 Route Handlers / Server Actions
- 不需要额外再起一层传统 BFF

不建议：

- 把仓库拉取、模型调用、批量扫描塞进 Next.js 请求周期
- 用 Next.js 直接消费长时间任务

### 5.2 Auth 层：Supabase Auth

选型：

- 控制台用户登录使用 `Supabase Auth`
- Next.js SSR 场景使用 `@supabase/ssr`
- 控制台的组织、成员、角色通过业务表扩展

边界说明：

- `Supabase Auth` 负责“谁能登录控制台”
- GitHub / GitLab / Gitee 的 App 安装、仓库授权是另一套集成能力，不能和控制台登录混为一谈

建议：

- 首版支持邮箱魔法链接或 GitHub OAuth 登录
- 仓库授权单独存储 provider access token / installation metadata

### 5.3 数据层：Supabase Postgres

选型：

- `Supabase Postgres` 作为唯一主库
- 所有核心业务数据都落在 Postgres
- 多租户隔离基于组织 ID + RLS

核心表建议：

- `organizations`
- `memberships`
- `repositories`
- `repo_integrations`
- `ai_provider_configs`
- `ai_provider_bindings`
- `pull_requests`
- `review_runs`
- `review_issues`
- `review_comments`
- `review_feedback`
- `rule_sets`
- `rule_versions`
- `agent_prompts`
- `usage_events`

原因：

- 当前产品是典型关系型模型
- 后面还有统计、审计、筛选、聚合，Postgres 比轻量数据库更稳
- Supabase 原生就是完整 Postgres，后续不用迁库

### 5.4 数据访问层：优先 `supabase-js`，不默认上 ORM

最终建议：

- 前台和普通服务端逻辑：`supabase-js`
- 类型安全：`supabase gen types typescript`
- 复杂查询：`SQL View + RPC + Materialized View`
- Worker 端：直连 Postgres 或服务端 `supabase-js`

不默认上 Prisma 的原因：

- Supabase 的强项是 `RLS + Realtime + Storage + Auth + RPC`
- 如果首版就默认用 ORM，会多一层抽象和迁移心智
- 对这个产品来说，很多核心查询更像“报表 / 聚合 / 状态机 SQL”，不只是 CRUD

结论：

- MVP 阶段先用 `supabase-js + SQL migration + 生成类型`
- 如果后期服务端领域模型明显变复杂，再评估是否补 ORM

### 5.5 队列层：Redis + BullMQ

选型：

- 使用 `Redis` 作为队列底座
- 使用 `BullMQ` 作为任务编排层
- 一个主队列：`pr_review_jobs`
- 一个补偿队列：`review_retry_jobs`
- 可选归档队列：`review_replay_jobs`

适合承担的任务：

- 新 PR 审查
- 增量 commit 重审
- 规则变更后的重跑
- 失败任务重试
- 统计补算

为什么选它：

- `BullMQ` 对 Node.js Worker 生态更成熟
- 原生支持并发、延迟任务、重试、退避、优先级、事件监听
- 对 PR 审查这类长任务和高频重试场景更顺手
- Worker 的实现心智更直接，后面扩容也更自然

边界：

- Redis 只负责任务编排，不承担业务主存储
- 如果后面任务吞吐极高，再评估 Kafka 等更重型方案

### 5.6 Worker 层：独立 Node.js 进程

选型：

- 单独部署 `worker` 服务
- 通过 `BullMQ Worker` 消费任务
- 使用本地临时目录处理仓库快照

Worker 负责：

- 拉取仓库
- 获取 diff 和上下文
- 执行规则
- 通过 `Vercel AI SDK` 调用模型
- 生成 PR 摘要、问题、Agent 修复提示词
- 写回数据库和存储

为什么必须独立：

- 审查链路是长任务
- 会涉及 Git、文件系统、超时、重试、并发控制
- Supabase Edge Functions 官方文档也明确更适合低延迟、短时任务，重任务应放到后台 Worker

启动方式建议：

- 开发环境：`tsx watch`
- 生产环境：编译后 `node dist/index.js`
- 部署在 `Railway / Fly.io / ECS / k8s` 这类长运行环境

AI 接入约束：

- 统一通过 `Vercel AI SDK` 对接模型提供方
- 首版支持 `OpenAI / Anthropic / Alibaba(Qwen)` 三类 provider
- 业务层只依赖内部 `packages/ai` 适配层，不直接耦合具体厂商 SDK
- 模型超时、重试、fallback 由 Worker 侧统一处理

### 5.7 文件层：Supabase Storage

存放内容：

- 审查中间产物
- PR 快照
- Prompt 导出文件
- 审查日志归档
- 规则模板文件

原因：

- 已与 Auth 和 RLS 打通
- 不需要额外接 S3 SDK 和权限系统

Bucket 建议：

- `review-artifacts`
- `review-logs`
- `exports`
- `rule-assets`

### 5.8 实时层：Supabase Realtime

用途：

- 审查状态从 `queued -> running -> completed / failed` 的实时推送
- 控制台中的结果自动刷新
- 评论处理状态同步

建议：

- 优先使用 `Broadcast`
- 不把 Realtime 当消息队列
- 只做前端状态同步，不承担核心任务编排

### 5.9 向量层：pgvector

用途：

- 规则语义检索
- 代码规范 / 团队知识召回
- 相似历史问题推荐
- 需求转计划的知识增强

建议：

- 首版向量数据仍放在同一个 Supabase Postgres
- 先做小规模知识检索
- 不要一开始就上独立向量库

## 6. 关键设计决策

### 6.1 数据权限

必须执行：

- 浏览器侧只用 `publishable key`
- 所有公开 schema 表开启 `RLS`
- 用户仅能看到自己组织下的数据
- `service_role key` 只允许在 Next.js 服务端和 Worker 环境变量中使用
- 大模型 API Key 统一存放在数据库中，且必须以加密 secret 方式存储
- 大模型 API Key 不下发到浏览器，不通过前端直连模型提供商
- 业务表只保存 `vault_secret_id`、provider、适用范围、状态等元数据
- 只有服务端和 Worker 可读取解密后的密钥

### 6.2 异步任务设计

建议采用状态机：

- `queued`
- `running`
- `succeeded`
- `failed`
- `retrying`
- `cancelled`

每次审查生成独立 `review_run`，不要直接覆盖旧结果。

### 6.3 Git 平台集成

建议拆成两层：

- 控制台身份：Supabase Auth
- 代码托管授权：GitHub / GitLab / Gitee 集成表

不要把仓库授权直接挂在用户 session 上，否则后面做组织级安装会很难看。

### 6.4 规则与审查结果

建议：

- 规则配置保存在 Postgres
- 仓库根目录 YAML 作为外部输入
- 审查时把数据库规则和仓库规则合并后生成最终执行配置

这样做的好处：

- 平台侧可管理
- 仓库内可版本化
- 后续支持模板和继承时不用推倒重来

## 7. 不选什么

### 7.1 不选纯 Next.js 单体

原因：

- PR 审查不是普通 Web 请求
- 长任务、重试、并发、幂等都会把单体拖垮

### 7.2 不选 SQLite / 本地文件做主存储

原因：

- 有 Webhook 并发写入
- 有 Worker 状态流转
- 有多租户和统计需求
- 不适合长期主库

### 7.3 不使用 Supabase Queues 作为主队列

原因：

- PR 审查天然是异步长任务，Redis 队列更成熟
- `BullMQ` 对并发、延迟、重试、退避、死信处理更顺手
- Worker 生态更完整，后面扩容和运维更稳

### 7.4 不首版引入 Prisma 作为默认主访问层

原因：

- 先发挥 Supabase 原生能力
- 避免早期双抽象

## 8. 推荐仓库结构

```txt
apps/
  web/                 # Next.js 控制台
  worker/              # 审查任务消费者
packages/
  ui/                  # 共享组件
  core/                # 审查领域逻辑
  git/                 # Git 平台集成
  ai/                  # 模型适配层
  db-types/            # Supabase 生成类型
supabase/
  migrations/          # SQL migration
  functions/           # 可选的轻量 Edge Functions
  seed.sql
```

## 9. 开发与部署建议

### 9.1 本地开发

- 用 `Supabase CLI` 起本地 Supabase 栈
- `Next.js` 本地 dev server
- `Worker` 本地独立进程

推荐命令：

```bash
npx supabase init
npx supabase start
npx supabase gen types typescript --local > packages/db-types/database.types.ts
pnpm dev:web
pnpm dev:worker
```

### 9.2 生产部署

推荐组合：

- `web`：Vercel 或自托管 Node
- `worker`：Railway / Fly.io / ECS / k8s
- `supabase`：托管 Supabase

原因：

- Web 和 Worker 生命周期不同
- Web 更重视请求响应
- Worker 更重视稳定运行、并发和重试

## 10. 分阶段落地

### P0

- Next.js 控制台
- Supabase Auth
- Supabase Postgres
- Redis + BullMQ
- Worker
- Supabase Storage
- Supabase Realtime

### P1

- pgvector 知识检索
- Cron 补偿和统计任务
- Edge Functions 处理少量轻量回调
- 更复杂的组织权限模型

### P2

- 高吞吐场景下评估 Kafka 等更重型消息系统
- 多仓上下文检索增强
- 模型路由和成本治理

## 11. 最终建议

如果已经确定基于 Next.js 开发，且希望基础设施尽量轻，推荐最终方案如下：

- Web：`Next.js 16 + App Router + TypeScript`
- AI 接入：`Vercel AI SDK`
- 密钥存储：`Supabase Vault + 业务配置表`
- 后端基础设施：`Supabase Postgres + Auth + Storage + Realtime + Cron + pgvector`
- 队列基础设施：`Redis + BullMQ`
- 异步执行：`独立 Node.js Worker`
- 数据访问：`supabase-js + SQL migration + 生成类型`

一句话结论：

> 用 `Next.js` 做产品外壳，用 `Supabase` 做数据和平台底座，用 `Redis + BullMQ` 做任务编排，用独立 `Worker` 承担所有重型审查任务。

补充说明：

- 模型统一经 `Vercel AI SDK` 接入
- 模型密钥统一存储在数据库中，并通过 `Supabase Vault` 加密管理

## 12. AI 接入补充

### 12.1 `packages/ai` 目录建议

```txt
packages/
  ai/
    src/
      index.ts
      providers/
        openai.ts
        anthropic.ts
        alibaba.ts
      models.ts
      tasks/
        review-summary.ts
        review-findings.ts
        fix-prompt.ts
        embeddings.ts
      telemetry.ts
      types.ts
```

设计原则：

- 业务层不直接 import `@ai-sdk/openai`、`@ai-sdk/anthropic`、`@ai-sdk/alibaba`
- `web` 和 `worker` 只调用 `packages/ai` 暴露的方法
- 模型切换、fallback、超时、日志都收敛在这一层

### 12.2 对外接口建议

```ts
export type ReviewLanguage = "zh-CN" | "en-US" | "es-ES";

export type ReviewTaskContext = {
  repoId: string;
  pullRequestId: string;
  language: ReviewLanguage;
  diffText: string;
  changedFiles: string[];
  repoRules?: string;
  extraContext?: string;
};

export type ReviewFinding = {
  title: string;
  severity: "low" | "medium" | "high" | "critical";
  confidence: number;
  summary: string;
  file?: string;
  suggestion?: string;
};

export interface AiGateway {
  generateReviewSummary(input: ReviewTaskContext): Promise<string>;
  generateReviewFindings(input: ReviewTaskContext): Promise<ReviewFinding[]>;
  generateFixPrompt(
    input: ReviewTaskContext & { findings: ReviewFinding[] }
  ): Promise<string>;
  embedKnowledge(input: { id: string; content: string }): Promise<number[]>;
}
```

建议：

- `reviewSummary` 和 `reviewFindings` 分开，方便独立调优
- `fixPrompt` 单独建接口，避免和 code review 输出强耦合
- embedding 单独走一条链路，不和主审查共享超时策略

### 12.3 模型选择建议

P0 建议固定三类 provider：

- `OpenAI`：主模型之一，负责摘要、结构化输出、embedding
- `Anthropic`：主模型之一，负责高质量 code review 和 fallback
- `Alibaba(Qwen)`：面向国内环境和成本优化场景

任务建议：

| 任务             | 默认模型策略              |
| ---------------- | ------------------------- |
| PR 摘要          | `OpenAI` 或 `Qwen`        |
| 高价值问题识别   | `Anthropic` 优先          |
| Agent 修复提示词 | `OpenAI` 或 `Anthropic`   |
| embedding        | `OpenAI` 优先，后续可替换 |

P0 不建议：

- 前台开放用户自由选任意模型
- 同一个 PR 同时调用太多模型做投票
- 一开始就做复杂模型路由 UI

### 12.4 数据库密钥策略

当前阶段采用“密钥存数据库”的方案，但不是明文入表。

推荐做法：

- 密钥值使用 `Supabase Vault` 存储
- 业务表只保存密钥引用和适用范围
- 支持组织级、仓库级模型配置绑定
- 所有解密读取仅允许服务端和 Worker 执行

建议的数据结构：

- `ai_provider_configs`
  - `id`
  - `organization_id`
  - `provider`
  - `display_name`
  - `vault_secret_id`
  - `is_active`
  - `created_by`
  - `created_at`
- `ai_provider_bindings`
  - `id`
  - `organization_id`
  - `repository_id`
  - `task_type`
  - `provider_config_id`
  - `model_name`
  - `fallback_provider_config_id`
  - `created_at`

说明：

- 密钥本体不进入普通业务表
- 前端只显示掩码后的 provider 配置，不回显原始密钥
- 如果后面要支持企业 BYOK，这套结构可以直接复用

### 12.5 环境变量清单

```bash
# App
NODE_ENV=development
APP_URL=http://localhost:3000

# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# Redis
REDIS_URL=redis://127.0.0.1:6379

# Optional default routing
AI_DEFAULT_PROVIDER=anthropic
AI_DEFAULT_REVIEW_MODEL=claude-sonnet-4-5
AI_DEFAULT_SUMMARY_MODEL=gpt-5-mini
AI_DEFAULT_EMBEDDING_MODEL=text-embedding-3-large
AI_FALLBACK_PROVIDER=openai
AI_REQUEST_TIMEOUT_MS=45000
```

约束：

- `NEXT_PUBLIC_` 前缀只给浏览器可见变量
- 模型密钥不通过环境变量作为主存储
- `worker` 和 `next` 服务需要有权限读取数据库中的加密密钥引用

### 12.6 Provider 配置示例

业务配置表示意：

```ts
export type AiProviderConfig = {
  id: string;
  organizationId: string;
  provider: "openai" | "anthropic" | "alibaba";
  displayName: string;
  vaultSecretId: string;
  isActive: boolean;
};
```

```ts
// packages/ai/src/providers/openai.ts
import { createOpenAI } from "@ai-sdk/openai";

export function createOpenAIProvider(apiKey: string) {
  return createOpenAI({ apiKey });
}
```

```ts
// packages/ai/src/providers/anthropic.ts
import { createAnthropic } from "@ai-sdk/anthropic";

export function createAnthropicProvider(apiKey: string) {
  return createAnthropic({ apiKey });
}
```

```ts
// packages/ai/src/providers/alibaba.ts
import { createAlibaba } from "@ai-sdk/alibaba";

export function createAlibabaProvider(apiKey: string) {
  return createAlibaba({ apiKey });
}
```

```ts
// packages/ai/src/models.ts
import { createAnthropicProvider } from "./providers/anthropic";
import { createOpenAIProvider } from "./providers/openai";
import { createAlibabaProvider } from "./providers/alibaba";

export function getReviewModel(input: {
  provider?: string;
  apiKey: string;
  modelName?: string;
}) {
  switch (input.provider ?? process.env.AI_DEFAULT_PROVIDER) {
    case "openai":
      return createOpenAIProvider(input.apiKey)(
        input.modelName || process.env.AI_DEFAULT_REVIEW_MODEL || "gpt-5-mini"
      );
    case "alibaba":
      return createAlibabaProvider(input.apiKey)(
        input.modelName || process.env.AI_DEFAULT_REVIEW_MODEL || "qwen-plus"
      );
    case "anthropic":
    default:
      return createAnthropicProvider(input.apiKey)(
        input.modelName ||
          process.env.AI_DEFAULT_REVIEW_MODEL ||
          "claude-sonnet-4-5"
      );
  }
}
```

```ts
// packages/ai/src/tasks/review-findings.ts
import { generateObject } from "ai";
import { z } from "zod";
import { getReviewModel } from "../models";

const findingSchema = z.object({
  title: z.string(),
  severity: z.enum(["low", "medium", "high", "critical"]),
  confidence: z.number(),
  summary: z.string(),
  file: z.string().optional(),
  suggestion: z.string().optional(),
});

export async function generateReviewFindings(input: {
  prompt: string;
  apiKey: string;
  modelName?: string;
  provider?: "openai" | "anthropic" | "alibaba";
}) {
  const result = await generateObject({
    model: getReviewModel({
      provider: input.provider,
      apiKey: input.apiKey,
      modelName: input.modelName,
    }),
    schema: z.object({
      findings: z.array(findingSchema),
    }),
    prompt: input.prompt,
  });

  return result.object.findings;
}
```

### 12.7 Fallback 建议

先做最小 fallback：

- 主模型超时
- 主模型返回结构化结果失败
- 主模型命中限流

建议流程：

```txt
Anthropic -> OpenAI -> Alibaba(Qwen)
```

原因：

- `Anthropic` 优先做高质量审查
- `OpenAI` 作为通用 fallback
- `Qwen` 作为国内可用性和成本补位

### 12.8 监控建议

每次模型调用至少记录：

- `provider`
- `model`
- `task_type`
- `latency_ms`
- `input_tokens`
- `output_tokens`
- `estimated_cost`
- `success`
- `fallback_count`

这些字段建议写入 `usage_events`，方便后面做模型路由和成本治理。

### 12.9 密钥读取原则

- 前端不读取、不缓存、不展示原始密钥
- Next.js 服务端和 Worker 只在调用模型前短暂读取
- 日志、错误栈、审计表禁止记录完整密钥
- 删除 provider 配置时，需同步删除对应 Vault Secret 或标记失效

## 13. 参考资料

- Next.js App Router: https://nextjs.org/docs/app
- Next.js Server / Client Components: https://nextjs.org/docs/app/getting-started/server-and-client-components
- Next.js Route Handlers: https://nextjs.org/docs/app/api-reference/file-conventions/route
- Supabase Next.js SSR Auth: https://supabase.com/docs/guides/auth/server-side/nextjs
- Supabase Auth with Next.js: https://supabase.com/docs/guides/auth/quickstarts/nextjs
- Supabase Database: https://supabase.com/docs/guides/database/overview
- Supabase Storage: https://supabase.com/docs/guides/storage
- Supabase Realtime: https://supabase.com/docs/guides/realtime
- Supabase Realtime Broadcast: https://supabase.com/docs/guides/realtime/subscribing-to-database-changes
- Supabase Cron: https://supabase.com/docs/guides/cron
- Supabase Edge Functions: https://supabase.com/docs/guides/functions
- Supabase Edge Functions Limits: https://supabase.com/docs/guides/functions/limits
- Supabase CLI: https://supabase.com/docs/guides/cli
- Supabase Type Generation: https://supabase.com/docs/guides/api/rest/generating-types
- Supabase RLS: https://supabase.com/docs/guides/database/postgres/row-level-security
- Supabase pgvector: https://supabase.com/docs/guides/database/extensions/pgvector
- Supabase Vault: https://supabase.com/docs/guides/database/vault
- BullMQ Quick Start: https://docs.bullmq.io/guide/quick-start
- BullMQ Connections: https://docs.bullmq.io/guide/connections
- BullMQ Retrying Jobs: https://docs.bullmq.io/guide/retrying-failing-jobs
- Redis Node.js Client: https://redis.io/docs/latest/develop/clients/nodejs/
- Vercel AI SDK: https://ai-sdk.dev/docs/introduction
- AI SDK Providers: https://ai-sdk.dev/docs/foundations/providers-and-models
- OpenAI Provider: https://ai-sdk.dev/providers/ai-sdk-providers/openai
- Anthropic Provider: https://ai-sdk.dev/providers/ai-sdk-providers/anthropic
- Alibaba Provider: https://ai-sdk.dev/providers/ai-sdk-providers/alibaba
