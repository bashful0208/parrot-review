# 基于 Next.js + 自建 PostgreSQL 的技术选型文档

> 当前工程已统一收敛到 `self-hosted PostgreSQL`：运行时通过 `DATABASE_URL` 连接，迁移目录使用 `postgres/migrations`，其它平台能力保持中性待定。

## 1. 文档目标

为 AI PR 审查产品的 MVP 和首个可商用版本确定一套偏轻量、上线快、后续可扩展的技术方案。

本文本轮只锁定数据库底座，不锁定其它平台配套能力。

本文只解决三件事：

- 前台控制台和 BFF 怎么做
- 后台异步审查链路怎么做
- 在数据库底座明确为自建 PostgreSQL 的前提下，其它平台能力保持中性待定

## 2. 选型结论

### 2.1 总体结论

采用 `Next.js + self-hosted PostgreSQL + Redis + BullMQ + 独立 Worker` 架构。

- `Next.js` 负责控制台、配置页、审查结果页、Webhook 接入层和 BFF
- `self-hosted PostgreSQL` 负责业务主库、多租户数据、规则、评论、任务状态、向量扩展能力
- `Redis + BullMQ` 负责任务队列、重试、延迟任务和回放任务
- `Worker` 负责仓库拉取、diff 分析、规则执行、模型调用、结果回写
- 身份认证、对象存储、实时推送、密钥管理、本地平台工具链均暂不在本轮锁定具体产品

这套方案优先把主数据底座和异步执行链路定下来，便于后续围绕认证、存储、实时能力做独立选型。

### 2.2 最终选型表

| 层           | 选型                                   | 角色                                       |
| ------------ | -------------------------------------- | ------------------------------------------ |
| Web          | `Next.js 16 + App Router + TypeScript` | 控制台、BFF、Webhook、管理后台             |
| UI           | `Tailwind CSS + shadcn/ui`             | 后台界面和配置页面                         |
| Auth         | `待定（中性方案）`                     | 控制台用户登录、组织成员会话               |
| AI 接入      | `Vercel AI SDK（当前推荐/已有方向，非本轮新增锁定）` | 统一对接 OpenAI / Claude / Qwen 等模型     |
| 密钥存储     | `待定（中性方案）`                     | 加密存储模型密钥及其绑定关系               |
| 主数据库     | `Self-hosted PostgreSQL`               | 业务主库、多租户数据、规则、评论、任务状态 |
| 队列         | `Redis + BullMQ`                       | PR 审查任务、重试任务、延迟任务、回放任务  |
| 文件存储     | `待定（中性方案）`                     | 审查快照、日志、导出文件、附件             |
| 实时更新     | `待定（中性方案）`                     | 审查状态更新、结果推送                     |
| 向量检索     | `pgvector`                             | 知识库、规则语义召回、历史经验检索         |
| 定时任务     | `BullMQ 已覆盖任务编排；独立 scheduler 待定` | 队列重试、延迟、回放；统计类周期任务待后续评估 |
| Worker       | `Node.js LTS + TypeScript`             | 长任务执行、Git 操作、模型调用             |
| 本地开发工具 | `待定（中性方案）`                     | 本地数据库、迁移、类型生成、配套能力联调   |

## 3. 为什么这样定

### 3.1 适合当前阶段

- 当前更需要的是先把主链路打通，而不是一次性锁死整套平台产品
- 数据库底座、异步队列、独立 Worker 是最影响架构边界和后续演进的核心部分
- `Redis + BullMQ` 单独承担队列、重试、延迟、回放等任务编排能力
- 若未来出现更独立的 scheduler 诉求，或需要统计类周期任务，再单独评估补充选型
- 认证、存储、实时、密钥管理等能力与数据库底座可以解耦，适合后续按约束再定

### 3.2 对这个产品特别合适

这个产品本质上有四类数据：

- 业务结构化数据：组织、仓库、PR、评论、规则、反馈
- 异步任务数据：审查任务、补偿任务、重试记录
- 文件和产物：快照、日志、导出文档
- 检索数据：规则语义、知识片段、历史经验 embedding

其中结构化数据、任务状态、规则配置和检索能力都天然适合放在 PostgreSQL 体系内。文件产物、认证体系、实时同步等外围能力则保持中性，避免本轮过度承诺具体平台。

## 4. 核心架构

### 4.1 架构原则

- `Next.js` 不承担重任务
- 所有 PR 审查都走异步链路
- `self-hosted PostgreSQL` 作为唯一主库
- `Redis` 只负责任务编排，不承担业务主存储
- 密钥管理只约束能力边界与安全原则，不预设具体实现或产品
- 本轮只锁定数据库底座，不锁定认证、对象存储、实时推送、密钥管理等平台配套能力
- 先单库单队列，后面再拆

### 4.2 架构图

```txt
GitHub / GitLab / Gitee
        |
        v
Next.js Web Layer
  - Route Handlers
  - Server Actions
  - Console / BFF
        |
        +--> 写 PostgreSQL
        |
        +--> 投递 Redis + BullMQ
        |
        v
Self-hosted PostgreSQL <------ Worker
        ^                      - 消费队列
        |                      - 拉仓库
        |                      - 分析 diff
        |                      - 执行规则
        |                      - 调用模型
        |                      - 写回结果
        |
        +--> File Storage(待定)
        |
        +--> Realtime Capability(待定) -> Next.js 控制台
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
- 无需单独部署独立 BFF 服务，由 `Next.js` 承担 BFF 职责

不建议：

- 把仓库拉取、模型调用、批量扫描塞进 Next.js 请求周期
- 用 Next.js 直接消费长时间任务

### 5.2 Auth 层：中性待定

当前结论：

- 控制台用户登录能力需要保留，但不在本轮锁定具体产品
- Next.js SSR 场景需要兼容服务端会话读取，但具体实现待后续选型
- 控制台的组织、成员、角色继续通过业务表扩展

边界说明：

- 控制台身份体系只解决“谁能登录控制台”
- GitHub / GitLab / Gitee 的 App 安装、仓库授权是另一套集成能力，不能和控制台登录混为一谈

### 5.3 数据层：Self-hosted PostgreSQL

选型：

- `self-hosted PostgreSQL` 作为唯一主库
- 所有核心业务数据都落在 PostgreSQL
- 多租户隔离基于组织 ID 和应用层权限控制
- 向量检索优先复用 `pgvector`

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
- 后面还有统计、审计、筛选、聚合，PostgreSQL 更稳
- 自建数据库底座可以更早掌握扩展、运维和数据边界

### 5.4 数据访问层：基于 PostgreSQL 的中性访问方案

最终建议：

- 前台和普通服务端逻辑：使用面向 PostgreSQL 的类型化访问层
- 类型安全：通过 schema / migration / type generation 维护
- 复杂查询：`SQL View + Function + Materialized View`
- Worker 端：直连 PostgreSQL 或复用内部服务端数据访问层

原则：

- 不预设必须绑定某个数据库平台 SDK
- 访问层应围绕 PostgreSQL 能力建设，而不是围绕特定云平台客户端建设
- 对这个产品来说，很多核心查询更像“报表 / 聚合 / 状态机 SQL”，不只是 CRUD

结论：

- MVP 阶段优先采用 `SQL migration + 生成类型 + 轻量访问层`
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
- 写回数据库和外围存储

为什么必须独立：

- 审查链路是长任务
- 会涉及 Git、文件系统、超时、重试、并发控制
- 这类重任务天然更适合放到后台 Worker，而不是挂在 Web 请求周期内

启动方式建议：

- 开发环境：`tsx watch`
- 生产环境：编译后 `node dist/index.js`
- 部署在 `Railway / Fly.io / ECS / k8s` 这类长运行环境

AI 接入约束：

- 当前推荐统一通过 `Vercel AI SDK` 对接模型提供方，但这属于推荐方向，不属于本轮新增锁定范围
- 当前更倾向由内部 `packages/ai` 适配层承接业务接入，避免业务层直接耦合具体厂商 SDK
- provider 组合、模型超时、重试、fallback 策略应在后续落地时按可用性、成本和部署环境细化

### 5.7 文件层：中性待定

当前结论：

- 文件产物能力需要保留，但不在本轮锁定具体对象存储产品
- 需要支持审查中间产物、PR 快照、Prompt 导出文件、日志归档、规则模板文件
- 存储系统需能与业务权限模型和 Worker 写入链路配合

建议：

- 接口设计保持中性，避免代码层绑定特定厂商 SDK
- 对外暴露统一的文件读写抽象，便于后续替换底层实现

### 5.8 实时层：中性待定

用途：

- 审查状态从 `queued -> running -> completed / failed` 的实时推送
- 控制台中的结果自动刷新
- 评论处理状态同步

建议：

- 实时能力只做前端状态同步，不承担核心任务编排
- 具体产品待后续根据连接模型、部署方式和成本再定

### 5.9 向量层：pgvector

用途：

- 规则语义检索
- 代码规范 / 团队知识召回
- 相似历史问题推荐
- 需求转计划的知识增强

建议：

- 首版向量数据仍放在同一个 PostgreSQL 中
- 先做小规模知识检索
- 不要一开始就上独立向量库

## 6. 关键设计决策

### 6.1 数据权限

必须执行：

- 浏览器不直接持有高权限数据库凭证
- 用户仅能看到自己组织下的数据
- 服务端和 Worker 才能执行高权限写入和后台任务相关操作
- 大模型 API Key 不下发到浏览器，不通过前端直连模型提供商
- 业务表只保存密钥关联关系、provider、适用范围、状态等元数据

能力边界：

- 密钥管理能力需要满足受保护存储、最小暴露面、可审计等安全原则
- 具体由哪种密钥系统、secret 形式或解密链路承载，本轮保持中性待定
- 服务端与 Worker 需要具备按权限使用密钥的能力，但不在本文提前锁定实现方式

### 6.2 异步任务设计

建议采用状态机：

- `queued`
- `running`
- `completed`
- `failed`
- `retrying`
- `cancelled`

每次审查生成独立 `review_run`，不要直接覆盖旧结果。

### 6.3 Git 平台集成

建议拆成两层：

- 控制台身份：待定的认证能力
- 代码托管授权：GitHub / GitLab / Gitee 集成表

不要把仓库授权直接挂在用户 session 上，否则后面做组织级安装会很难看。

### 6.4 规则与审查结果

建议：

- 规则配置保存在 PostgreSQL
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

### 7.3 不把数据库访问层绑定到单一平台 SDK

原因：

- 本轮锁定的是 PostgreSQL 底座，不是某个数据库一体化平台
- 过早绑定平台 SDK 会放大后续认证、存储、实时能力调整成本
- 保持访问层中性更利于后续演进

### 7.4 不首版引入 Prisma 作为默认主访问层

原因：

- 先发挥 PostgreSQL 原生能力
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
  db-types/            # 数据库生成类型
postgres/
  migrations/          # SQL migration
  seed.sql
```

## 9. 开发与部署建议

### 9.1 本地开发

- 本地启动 PostgreSQL
- `Next.js` 本地 dev server
- `Worker` 本地独立进程
- 认证、对象存储、实时能力、本地工具链按后续实际选型补齐

推荐命令：

```bash
pnpm dev:web
pnpm dev:worker
```

### 9.2 生产部署

推荐组合：

- `web`：Vercel 或自托管 Node
- `worker`：Railway / Fly.io / ECS / k8s
- `postgres`：self-hosted PostgreSQL
- 其它平台配套能力：待后续单独选型

原因：

- Web 和 Worker 生命周期不同
- Web 更重视请求响应
- Worker 更重视稳定运行、并发和重试
- 数据库底座和外围平台能力分离，有利于逐步演进

## 10. 分阶段落地

### P0

- Next.js 控制台
- Self-hosted PostgreSQL
- Redis + BullMQ
- Worker
- 认证能力的中性接口与边界预留
- 文件存储能力的中性接口与边界预留
- 实时通知能力的中性接口与边界预留
- 密钥管理能力的中性接口与边界预留

### P1

- pgvector 知识检索
- 补偿和统计任务
- 少量轻量回调能力
- 更复杂的组织权限模型
- 在已预留的中性能力边界上，再评估认证、对象存储、实时能力、密钥管理的具体产品选型

### P2

- 高吞吐场景下评估 Kafka 等更重型消息系统
- 多仓上下文检索增强
- 模型路由和成本治理

## 11. 最终建议

如果已经确定基于 Next.js 开发，且希望先把核心架构边界定清楚，当前推荐方向如下：

- Web：`Next.js 16 + App Router + TypeScript`
- AI 接入：`Vercel AI SDK` 作为优先评估方向
- 后端基础设施：`self-hosted PostgreSQL + pgvector`
- 队列基础设施：`Redis + BullMQ`
- 异步执行：`独立 Node.js Worker`
- 数据访问：`SQL migration + 生成类型 + 中性访问层`
- 认证 / 对象存储 / 实时推送 / 密钥管理 / 本地平台工具链：`本轮不锁定，保持中性待定`

一句话结论：

> 用 `Next.js` 做产品外壳，用 `self-hosted PostgreSQL` 做已锁定的数据底座，用 `Redis + BullMQ` 做任务编排，用独立 `Worker` 承担重型审查任务；AI 接入当前给出推荐方向，但不作为本轮新增锁定范围，其它平台配套能力继续保持中性待定。

补充说明：

- 模型接入当前推荐优先评估 `Vercel AI SDK`
- 当前只锁定数据库底座，不锁定 AI、Auth、对象存储、实时推送、密钥管理等平台能力

## 12. AI 接入补充

这里的 AI 接入内容用于统一团队当前推荐方向、设计约束和后续落地参考。

需要特别区分：

- `self-hosted PostgreSQL` 数据库底座属于本轮已锁定范围
- AI 接入不属于本轮新增锁定范围，当前仅给出推荐方向与候选结构
- 文中出现的 provider、模型、目录和接口示例，主要用于帮助后续实施时减少分歧，不代表已经定板

### 12.1 `packages/ai` 目录建议

如果后续继续沿用 `Vercel AI SDK + 内部适配层` 方向，可以优先考虑把模型接入收敛在 `packages/ai` 一类独立模块中，例如：

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

- 建议业务层不要直接 import `@ai-sdk/openai`、`@ai-sdk/anthropic`、`@ai-sdk/alibaba`
- `web` 和 `worker` 更适合依赖内部收口后的 AI 能力，而不是直接依赖厂商 SDK
- 模型切换、超时、fallback、日志等策略，建议尽量收敛在这一层

### 12.2 对外接口示例

下面接口更适合作为候选参考，而不是本轮已确认规范：

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

- `reviewSummary` 和 `reviewFindings` 分开，便于后续独立调优
- `fixPrompt` 可单独建接口，避免和 code review 输出强耦合
- embedding 更适合单独走一条链路，不必和主审查共享完全相同的超时策略

### 12.3 模型选择建议

P0 阶段可优先评估以下 provider 方向，但这里仍是推荐口径，不代表本轮已固定三类 provider：

- `OpenAI`：可作为摘要、结构化输出、embedding 等场景的候选
- `Anthropic`：可作为高质量 code review 场景的候选
- `Alibaba(Qwen)`：可作为国内环境或成本优化场景的候选

任务示例：

| 任务             | 候选模型方向                  |
| ---------------- | ----------------------------- |
| PR 摘要          | `OpenAI` 或 `Qwen`            |
| 高价值问题识别   | `Anthropic` 可优先评估        |
| Agent 修复提示词 | `OpenAI` 或 `Anthropic`       |
| embedding        | `OpenAI` 等可用方案优先评估   |

P0 不建议：

- 前台开放用户自由选任意模型
- 同一个 PR 同时调用太多模型做投票
- 一开始就做复杂模型路由 UI

### 12.4 数据库密钥策略

当前阶段只定义能力边界，不预设具体密钥产品或实现链路。

推荐做法：

- 密钥本体不进入普通业务表
- 业务表只保存密钥关联关系、适用范围和启用状态等元数据
- 支持组织级、仓库级模型配置绑定
- 密钥管理能力需满足受保护存储、按权限使用、最小暴露面等原则

建议的数据结构示意：

- `ai_provider_configs`
  - `id`
  - `organization_id`
  - `provider`
  - `display_name`
  - `secret_ref`
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
- 如果后面要支持企业 BYOK，这套结构可以复用

### 12.5 环境变量示例

下面清单仅用于说明后续落地时可能需要哪些运行时配置，不代表这些变量名、默认值或来源已经在本轮定板：

```bash
# App
NODE_ENV=development
APP_URL=http://localhost:3000

# Database
DATABASE_URL=
DATABASE_POOL_URL=

# Redis
REDIS_URL=redis://127.0.0.1:6379

# Optional routing examples
AI_DEFAULT_PROVIDER=anthropic
AI_DEFAULT_REVIEW_MODEL=claude-sonnet-4-5
AI_DEFAULT_SUMMARY_MODEL=gpt-5-mini
AI_DEFAULT_EMBEDDING_MODEL=text-embedding-3-large
AI_FALLBACK_PROVIDER=openai
AI_REQUEST_TIMEOUT_MS=45000
```

约束：

- 模型密钥不应通过环境变量作为主存储
- `worker` 和 `next` 服务需要有权限读取密钥关联元数据，并通过后续选定的受保护能力完成实际使用
- 当前代码里数据库连接统一使用 `DATABASE_URL`，不再保留旧平台遗留环境变量

### 12.6 Provider 配置示例

以下示例只用于说明推荐的抽象方式，便于后续落地时参考；provider 命名、默认模型、代码组织方式都不视为本轮已锁定规范。

业务配置表示意：

```ts
export type AiProviderConfig = {
  id: string;
  organizationId: string;
  provider: "openai" | "anthropic" | "alibaba";
  displayName: string;
  secretRef: string;
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
  switch (input.provider) {
    case "openai":
      return createOpenAIProvider(input.apiKey)(
        input.modelName || "gpt-5-mini"
      );
    case "alibaba":
      return createAlibabaProvider(input.apiKey)(
        input.modelName || "qwen-plus"
      );
    case "anthropic":
    default:
      return createAnthropicProvider(input.apiKey)(
        input.modelName || "claude-sonnet-4-5"
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

先做最小 fallback 即可，触发条件可优先考虑：

- 主模型超时
- 主模型返回结构化结果失败
- 主模型命中限流

候选流程示例：

```txt
Anthropic -> OpenAI -> Alibaba(Qwen)
```

说明：

- 这里只给出一种便于讨论的候选顺序，不代表 fallback 顺序已经在本轮最终确认
- 实际主次关系应结合可用性、成本、地区合规、延迟和任务类型在落地阶段再定

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
- 删除 provider 配置时，需同步删除或失效对应的密钥引用

## 13. 参考资料

- Next.js App Router: https://nextjs.org/docs/app
- Next.js Server / Client Components: https://nextjs.org/docs/app/getting-started/server-and-client-components
- Next.js Route Handlers: https://nextjs.org/docs/app/api-reference/file-conventions/route
- PostgreSQL: https://www.postgresql.org/docs/
- pgvector: https://github.com/pgvector/pgvector
- BullMQ Quick Start: https://docs.bullmq.io/guide/quick-start
- BullMQ Connections: https://docs.bullmq.io/guide/connections
- BullMQ Retrying Jobs: https://docs.bullmq.io/guide/retrying-failing-jobs
- Redis Node.js Client: https://redis.io/docs/latest/develop/clients/nodejs/
- Vercel AI SDK: https://ai-sdk.dev/docs/introduction
- AI SDK Providers: https://ai-sdk.dev/docs/foundations/providers-and-models
- OpenAI Provider: https://ai-sdk.dev/providers/ai-sdk-providers/openai
- Anthropic Provider: https://ai-sdk.dev/providers/ai-sdk-providers/anthropic
- Alibaba Provider: https://ai-sdk.dev/providers/ai-sdk-providers/alibaba
