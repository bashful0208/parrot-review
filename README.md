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

## 启动命令

先安装依赖：

```bash
pnpm run setup
```

同时启动 Web 和 Worker：

```bash
pnpm run dev
```

- 这个命令会同时拉起 `apps/web` 和 `apps/worker`
- 如果任一服务以非零状态退出，根脚本也会返回相同失败码
- 数据库配置统一使用 `DATABASE_URL`
- 默认会使用 `REDIS_URL=redis://127.0.0.1:6379` 与 `REVIEW_QUEUE_NAME=review-jobs`
- 其他必填环境变量可先复制根目录 `.env.example`，完整说明见 `doc/startup-and-deployment.md`
- Redis 不可达时，worker 会立即失败退出；详细说明见 `doc/startup-and-deployment.md`

只启动 Web：

```bash
pnpm run dev:web
```

只启动 Worker：

```bash
pnpm run dev:worker
```

- `pnpm run dev:worker` 同样会使用默认的本地 Redis 地址，除非你在启动前覆盖 `REDIS_URL`
