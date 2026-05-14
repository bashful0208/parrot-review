# 用户指南

本文档详细介绍如何部署、配置和使用 Reviewer AI 代码审查系统。

## 目录

- [快速入门](#快速入门)
- [环境要求](#环境要求)
- [安装部署](#安装部署)
- [配置说明](#配置说明)
- [Git 平台集成](#git-平台集成)
- [Web 管理后台](#web-管理后台)
- [审查流程](#审查流程)
- [Docker 部署](#docker-部署)
- [常见问题](#常见问题)

## 快速入门

### 1. 克隆项目

```bash
git clone <repository-url>
cd reviewer
```

### 2. 配置环境变量

```bash
cp .env.example .env
```

编辑 `.env` 文件，至少配置以下变量：

```env
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/reviewer
REDIS_URL=redis://localhost:6379
REVIEW_QUEUE_NAME=review-jobs
DEFAULT_MODEL_PROVIDER=anthropic
DEFAULT_MODEL_NAME=claude-3-7-sonnet
```

### 3. 启动服务

**方式一：Docker Compose（推荐）**

```bash
docker compose up -d
```

**方式二：本地开发**

```bash
# 启动 PostgreSQL 和 Redis
docker compose -f docker-compose.dev.yml up -d

# 安装依赖并启动
pnpm run setup
pnpm run dev
```

### 4. 访问系统

- Web 界面：http://localhost:3000
- 注册账号：http://localhost:3000/register

## 环境要求

### 必需

- **Node.js** >= 22（推荐 LTS 版本）
- **pnpm** >= 9
- **PostgreSQL** >= 16
- **Redis** >= 7

### 可选

- **Docker** 和 **Docker Compose**（用于容器化部署）

## 安装部署

### 方式一：Docker Compose 完整部署

这是最简单的部署方式，包含所有组件：

```bash
# 克隆项目
git clone <repository-url>
cd reviewer

# 配置环境变量
cp .env.example .env
# 编辑 .env 文件

# 启动所有服务
docker compose up -d
```

服务启动后：
- Web 界面：http://localhost:3000
- PostgreSQL：localhost:5432
- Redis：localhost:6379

查看日志：

```bash
docker compose logs -f web
docker compose logs -f worker
```

停止服务：

```bash
docker compose down
```

### 方式二：Docker Compose 开发环境

只启动基础组件，Web 和 Worker 在宿主机运行：

```bash
# 启动 PostgreSQL 和 Redis
docker compose -f docker-compose.dev.yml up -d

# 在宿主机启动应用
pnpm run setup
pnpm run dev
```

### 方式三：完全本地安装

需要手动安装和配置 PostgreSQL 和 Redis：

```bash
# 安装依赖
pnpm run setup

# 启动开发服务器
pnpm run dev
```

## 配置说明

### 环境变量详解

#### 数据库配置

| 变量 | 说明 | 默认值 | 必填 |
|------|------|--------|------|
| `DATABASE_URL` | PostgreSQL 连接串 | - | 是 |

连接串格式：
```
postgresql://username:password@host:port/database
```

示例：
```env
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/reviewer
```

#### Redis 配置

| 变量 | 说明 | 默认值 | 必填 |
|------|------|--------|------|
| `REDIS_URL` | Redis 连接串 | `redis://127.0.0.1:6379` | 否 |
| `REVIEW_QUEUE_NAME` | BullMQ 队列名 | `review-jobs` | 否 |

Redis 连接串格式：
```
redis://[:password@]host[:port][/database]
```

示例：
```env
REDIS_URL=redis://:mypassword@redis-host:6379
```

#### AI 模型配置

| 变量 | 说明 | 默认值 | 必填 |
|------|------|--------|------|
| `DEFAULT_MODEL_PROVIDER` | 默认 AI 提供商 | - | 是（Web 启动需要） |
| `DEFAULT_MODEL_NAME` | 默认模型名称 | - | 是（Web 启动需要） |

支持的 AI 提供商：
- `anthropic` - Anthropic Claude
- `openai` - OpenAI GPT（兼容阿里云等）

示例：
```env
DEFAULT_MODEL_PROVIDER=anthropic
DEFAULT_MODEL_NAME=claude-3-7-sonnet
```

#### Webhook 配置

> 注意：Webhook 签名密钥已下放为仓库级配置，不再使用全局环境变量。每个仓库在添加时会自动生成独立的 Webhook Secret，通过 Web UI 管理。

### 数据库初始化

数据库迁移文件位于 `postgres/migrations/` 目录。系统会在首次启动时自动执行迁移。

手动执行迁移：

```bash
# 使用 psql
psql -U postgres -d reviewer -f postgres/migrations/0001_initial.sql
psql -U postgres -d reviewer -f postgres/migrations/0002_comments.sql
# ... 依次执行所有迁移文件
```

## Git 平台集成

### GitHub 集成

#### 方式一：GitHub App（推荐）

1. **创建 GitHub App**
   - 访问 GitHub Settings > Developer settings > GitHub Apps > New GitHub App
   - 填写应用名称和 Homepage URL
   - 配置 Webhook URL：`https://your-domain.com/api/webhooks/github`
   - 生成 Webhook Secret

2. **配置权限**
   - Repository permissions：
     - Pull requests: Read & Write
     - Contents: Read
   - Subscribe to events：
     - Pull request

3. **安装 App**
   - 在目标仓库安装 GitHub App
   - 记录 Installation ID

#### 方式二：Webhook

1. **进入仓库设置**
   - 访问仓库 Settings > Webhooks > Add webhook

2. **配置 Webhook**
   - Payload URL：`https://your-domain.com/api/webhooks/github`
   - Content type：`application/json`
   - Secret：在 Reviewer Web UI 中获取的仓库 Webhook Secret
   - Events：选择 "Pull requests"

### Gitee 集成

1. **进入仓库设置**
   - 访问仓库 Settings > WebHooks

2. **配置 Webhook**
   - URL：`https://your-domain.com/api/webhooks/gitee`
   - Secret：在 Reviewer Web UI 中获取的仓库 Webhook Secret
   - 勾选 "Pull Request" 事件

### GitLab 集成

1. **进入项目设置**
   - 访问项目 Settings > Webhooks

2. **配置 Webhook**
   - URL：`https://your-domain.com/api/webhooks/gitlab`
   - Secret Token：在 Reviewer Web UI 中获取的仓库 Webhook Secret
   - 勾选 "Merge request events"

### Webhook Secret 管理

每个仓库的 Webhook Secret 是独立的，通过 Web UI 管理：

1. 登录 Reviewer Web UI
2. 进入仓库管理页面
3. 选择目标仓库
4. 复制 Webhook Secret
5. 粘贴到 Git 平台的 Webhook 配置中

## Web 管理后台

### 用户注册/登录

1. 访问 http://localhost:3000/register 注册账号
2. 使用注册的邮箱和密码登录

### 仓库管理

#### 添加仓库

1. 进入 "Repositories" 页面
2. 点击 "Add Repository"
3. 填写仓库信息：
   - 仓库名称
   - Git 平台（GitHub/Gitee/GitLab）
   - 仓库 URL
   - 访问 Token（用于获取 PR 信息）
4. 保存后获取 Webhook Secret

#### 仓库配置

每个仓库可以独立配置：
- Webhook Secret（自动生成）
- 访问凭证（加密存储）
- 审查语言偏好

### AI Provider 配置

1. 进入 "Settings" > "Providers"
2. 点击 "Add Provider"
3. 配置 Provider 信息：
   - 名称
   - 类型（Anthropic/OpenAI）
   - API Key
   - 模型名称
4. 保存配置

支持的 Provider：
- **Anthropic**：Claude 3.5 Sonnet、Claude 3 Opus 等
- **OpenAI**：GPT-4、GPT-4 Turbo 等
- **兼容 Provider**：阿里云等 OpenAI 兼容接口

### 审查记录查看

1. 进入 "Review Runs" 页面
2. 查看所有审查记录列表
3. 点击单条记录查看详情：
   - 审查状态（queued/running/succeeded/failed）
   - 发现的问题列表
   - 审查摘要
   - Token 用量统计

### 用量统计

1. 进入 "Usage" 页面
2. 查看：
   - 总审查次数
   - Token 消耗
   - 成本统计
   - 按仓库/时间筛选

## 审查流程

### 自动审查触发条件

当以下事件发生时，系统会自动触发审查：

- **GitHub**：PR opened、synchronize（新提交推送）、reopened
- **Gitee**：PR opened、updated、reopened
- **GitLab**：MR opened、updated、reopened

### 审查流程详解

1. **Webhook 接收**
   - 接收 Git 平台的 PR 事件
   - 验证 Webhook 签名
   - 归一化事件格式

2. **任务入队**
   - 将审查任务写入 Redis 队列
   - 按 deliveryId 去重，避免重复触发

3. **Worker 处理**
   - 加载仓库配置和凭证
   - 获取 PR 元数据和 Diff
   - 加载审查指南（CLAUDE.md、AGENTS.md 等）

4. **AI 审查**
   - 三个审查员并行执行：
     - Quality Reviewer：代码质量审查
     - Security Reviewer：安全漏洞检测
     - Error Handler Reviewer：错误处理审查
   - Aggregator 去重和排序
   - Critic 反思循环验证（最多 2 轮）

5. **结果输出**
   - 写入数据库
   - 发送总结评论到 PR
   - 发送 inline 评论到具体代码行

### 审查结果解读

#### 问题严重程度

- **Critical**：严重问题，必须修复
- **High**：高优先级问题，建议尽快修复
- **Medium**：中等问题，建议修复
- **Low**：低优先级，可选修复

#### 问题类型

- **Quality**：代码质量问题（命名、结构、可读性等）
- **Security**：安全漏洞（注入、XSS、敏感信息泄露等）
- **Error Handling**：错误处理问题（空 catch、宽泛捕获等）

## Docker 部署

### 完整部署

```yaml
# docker-compose.yml 包含：
# - PostgreSQL 16
# - Redis 7
# - Web 应用
# - Worker 进程
```

启动：

```bash
docker compose up -d
```

### 环境变量配置

创建 `.env` 文件：

```env
# 数据库
DATABASE_URL=postgresql://postgres:postgres@postgres:5432/reviewer

# Redis
REDIS_URL=redis://redis:6379
REVIEW_QUEUE_NAME=review-jobs

# AI 模型
DEFAULT_MODEL_PROVIDER=anthropic
DEFAULT_MODEL_NAME=claude-3-7-sonnet

# 可选：自定义端口
WEB_PORT=3000
```

### 生产环境建议

1. **数据库**
   - 使用外部 PostgreSQL 服务
   - 配置定期备份
   - 设置连接池

2. **Redis**
   - 使用外部 Redis 服务
   - 配置持久化
   - 设置密码认证

3. **Web 服务**
   - 配置反向代理（Nginx/Caddy）
   - 启用 HTTPS
   - 配置域名

4. **Worker 服务**
   - 可部署多个 Worker 实例
   - 监控 Worker 状态
   - 配置日志收集

### Docker Compose 生产配置示例

```yaml
version: '3.8'

services:
  web:
    image: reviewer-web:latest
    ports:
      - "3000:3000"
    environment:
      - DATABASE_URL=postgresql://user:pass@external-db:5432/reviewer
      - REDIS_URL=redis://:pass@external-redis:6379
      - DEFAULT_MODEL_PROVIDER=anthropic
      - DEFAULT_MODEL_NAME=claude-3-7-sonnet
    depends_on:
      - postgres
      - redis
    restart: unless-stopped

  worker:
    image: reviewer-worker:latest
    environment:
      - DATABASE_URL=postgresql://user:pass@external-db:5432/reviewer
      - REDIS_URL=redis://:pass@external-redis:6379
    depends_on:
      - postgres
      - redis
    restart: unless-stopped

  postgres:
    image: postgres:16-alpine
    environment:
      - POSTGRES_USER=postgres
      - POSTGRES_PASSWORD=postgres
      - POSTGRES_DB=reviewer
    volumes:
      - postgres_data:/var/lib/postgresql/data
    restart: unless-stopped

  redis:
    image: redis:7-alpine
    command: redis-server --requirepass yourpassword
    volumes:
      - redis_data:/data
    restart: unless-stopped

volumes:
  postgres_data:
  redis_data:
```

## 常见问题

### Q: Worker 启动失败，提示 Redis 连接失败

**A:** 检查以下几点：

1. Redis 是否已启动
2. `REDIS_URL` 配置是否正确
3. Redis 密码是否正确
4. 网络是否可达

```bash
# 测试 Redis 连接
redis-cli -h localhost -p 6379 ping
```

### Q: Webhook 触发但没有审查结果

**A:** 检查以下几点：

1. Worker 是否正常运行
2. Webhook Secret 是否配置正确
3. AI Provider 是否配置正确
4. 查看 Worker 日志获取详细错误信息

```bash
# 查看 Worker 日志
docker compose logs -f worker
```

### Q: 审查结果没有评论到 PR

**A:** 检查以下几点：

1. Git 平台的访问 Token 是否有评论权限
2. Webhook 配置是否包含正确的事件类型
3. 查看审查记录的状态和错误信息

### Q: 如何更换 AI 模型？

**A:** 两种方式：

1. **修改默认模型**：更新环境变量 `DEFAULT_MODEL_PROVIDER` 和 `DEFAULT_MODEL_NAME`
2. **修改仓库模型**：在 Web UI 的仓库设置中配置

### Q: 如何查看审查成本？

**A:** 进入 Web UI 的 "Usage" 页面，可以查看：
- 总 Token 消耗
- 按仓库统计
- 按时间统计
- 成本估算

### Q: 支持哪些编程语言？

**A:** 理论上支持所有编程语言，因为审查是基于 AI 模型的语义理解。实际效果取决于：
- AI 模型对特定语言的训练数据
- 代码的复杂度和上下文

### Q: 如何自定义审查规则？

**A:** 在目标仓库中添加以下文件：

- `CLAUDE.md`：通用编码规范
- `AGENTS.md`：Agent 行为规则
- `pattern.md`：代码模式和最佳实践

系统会在审查时自动加载这些文件作为审查指南。

### Q: 审查记录如何清理？

**A:** 目前需要手动清理数据库：

```sql
-- 清理 30 天前的审查记录
DELETE FROM review_runs WHERE created_at < NOW() - INTERVAL '30 days';
DELETE FROM review_issues WHERE created_at < NOW() - INTERVAL '30 days';
```

> 建议在清理前备份数据库。

### Q: 如何扩展 Worker 并发？

**A:** 两种方式：

1. **增加单 Worker 并发数**：修改 `apps/worker/src/index.ts` 中的 `concurrency` 参数
2. **部署多个 Worker 实例**：使用 Docker Compose scale

```bash
docker compose up -d --scale worker=3
```

## 获取帮助

- 查看日志：`docker compose logs -f`
- 提交 Issue：[GitHub Issues]
- 查看文档：`doc/` 目录
