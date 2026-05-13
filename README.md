# reviewer

## 项目简介

这是一个包含两个应用的代码仓库：

- `apps/web`：基于 Next.js 16 的前端应用
- `apps/worker`：基于 BullMQ + Redis 的后台 Worker

根目录提供了统一的 `pnpm` 启动入口和 `sh` 脚本，方便本地安装依赖与同时启动服务。

## 目录结构

```text
reviewer/
├── apps/
│   ├── web/
│   └── worker/
├── scripts/
├── doc/
├── docs/
├── tests/
└── package.json
```

## 启动方式

### 方式一：Docker Compose（推荐）

**完整部署**（PostgreSQL + Redis + Web + Worker）：

```bash
cp .env.example .env
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

详细说明见 `doc/startup-and-deployment.md`。
