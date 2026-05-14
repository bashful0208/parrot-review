# Reviewer - AI 驱动的代码审查系统

一个基于多 Agent 的智能代码审查系统，支持 GitHub、Gitee、GitLab 的 PR 自动审查。通过 LangGraph 编排多个 AI Agent 并行执行质量审查和安全审查，自动将审查结果评论到 PR。

## 核心功能

- **多平台支持** - GitHub、Gitee、GitLab 的 Webhook 集成
- **智能审查** - 基于 LangGraph 的多 Agent 并行审查流水线
  - 质量审查（Quality Reviewer）
  - 安全审查（Security Reviewer）
  - 错误处理审查（Error Handler Reviewer）
- **审查结果反馈** - 自动将审查意见评论到 PR（支持 inline 评论）
- **用量统计** - 跟踪每次审查的 Token 消耗和成本
- **Web 管理后台** - 仓库管理、AI Provider 配置、审查记录查看
- **断点恢复** - LangGraph 检查点持久化，支持审查中断后恢复

## 技术架构

```
GitHub/Gitee/GitLab ──webhook──▶ apps/web (Next.js) ──Redis──▶ apps/worker (BullMQ)
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

**审查流水线拓扑：**
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

## 技术栈

| 层 | 技术 |
|----|------|
| 前端 | Next.js 16、React 19、Tailwind CSS 4、shadcn/ui |
| 后端 Worker | Node.js、BullMQ、ioredis |
| AI/ML | LangGraph、Anthropic SDK、OpenAI SDK |
| 数据库 | PostgreSQL 16 |
| 缓存/队列 | Redis 7 |
| Git 集成 | Octokit (GitHub)、自定义客户端 (Gitee/GitLab) |

## 目录结构

```text
reviewer/
├── apps/
│   ├── web/                    # Next.js 前端应用
│   │   ├── src/app/            # App Router 页面和 API 路由
│   │   └── components/         # React 组件
│   └── worker/                 # BullMQ 后台 Worker
│       └── src/handlers/       # 任务处理器
├── packages/
│   ├── ai/                     # LangGraph 审查流水线、LLM 适配器
│   │   └── src/graph/          # 审查图节点和状态定义
│   ├── core/                   # 共享核心：认证、配置、错误处理、日志
│   ├── db-types/               # 数据库类型定义
│   ├── git/                    # Git 平台抽象层
│   └── shared/                 # 共享类型
├── postgres/
│   └── migrations/             # 数据库迁移文件
├── scripts/                    # 开发和部署脚本
├── doc/                        # 设计文档和研究报告
├── docs/                       # 用户文档
└── tests/                      # 集成测试
```

## 快速开始

### 方式一：Docker Compose（推荐）

**完整部署**（PostgreSQL + Redis + Web + Worker）：

```bash
cp .env.example .env
# 编辑 .env 填入真实配置
docker compose up -d
```

**仅基础组件**（只启动 PostgreSQL + Redis，Web/Worker 在宿主机开发）：

```bash
docker compose -f docker-compose.dev.yml up -d
```

### 方式二：本地开发（pnpm）

前置条件：PostgreSQL 和 Redis 已启动（可用上面的 `docker compose -f docker-compose.dev.yml up -d`）。

```bash
cp .env.example .env          # 首次需要
pnpm run setup                # 安装依赖
pnpm run dev                  # 同时启动 web + worker
```

单独启动：

```bash
pnpm run dev:web              # 只启动 Web (localhost:3000)
pnpm run dev:worker           # 只启动 Worker
```

### 环境变量

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `DATABASE_URL` | - | PostgreSQL 连接串，必填 |
| `REDIS_URL` | `redis://127.0.0.1:6379` | Redis 连接串 |
| `REVIEW_QUEUE_NAME` | `review-jobs` | BullMQ 队列名 |
| `DEFAULT_MODEL_PROVIDER` | - | 默认 AI 提供商（anthropic/openai） |
| `DEFAULT_MODEL_NAME` | - | 默认模型名称 |

> Webhook 签名密钥已下放为仓库级：每个接入仓库在 onboarding 时由后端生成独立 secret，通过 Web UI 管理。

## 使用流程

1. **注册账号** - 访问 `http://localhost:3000/register`
2. **配置 AI Provider** - 在设置页面添加 Anthropic 或 OpenAI 的 API Key
3. **添加仓库** - 在仓库管理页面添加要审查的代码仓库
4. **配置 Webhook** - 在 Git 平台配置 Webhook 指向本系统
5. **提交 PR** - 系统自动触发审查并评论到 PR

详细使用说明请参考 [用户指南](docs/user-guide.md)。

## 文档

- [用户指南](docs/user-guide.md) - 详细的使用说明
- [PR 审查流程](docs/pr-review-flow.md) - 审查流水线技术细节
- [启动与部署](doc/startup-and-deployment.md) - 部署文档

## 开发

```bash
# 安装依赖
pnpm run setup

# 启动开发环境
pnpm run dev

# 构建
pnpm run build

# 运行测试
pnpm run test

# 代码检查
pnpm run lint
```

## License

MIT
