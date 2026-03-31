# 项目启动与部署说明

## 1. 文档范围

本文只描述当前仓库里已经落地的两个服务，以及根目录新增的 `pnpm + sh` 启动脚本：

- `apps/web`：基于 `Next.js 16 + App Router + TypeScript + Tailwind CSS` 的前端 / 控制台工程
- `apps/worker`：基于 `Node.js + TypeScript + BullMQ + ioredis` 的后台 Worker 工程
- `package.json` + `scripts/*.sh`：根目录统一安装与开发启动入口

当前代码库已经提供根级脚本：可以在仓库根目录直接执行 `pnpm run setup`、`pnpm run dev:web`、`pnpm run dev:worker`、`pnpm run dev`。

## 2. 当前目录结构

```txt
reviewer/
├── apps/
│   ├── web/
│   └── worker/
├── doc/
├── package.json
└── scripts/
    ├── dev.sh
    ├── dev-web.sh
    ├── dev-worker.sh
    └── setup.sh
```

## 3. 运行前准备

建议本地环境至少具备：

- `Node.js LTS`
- `pnpm`

其中：

- `apps/web` 本地开发可以直接启动
- `apps/worker` 启动后会直接连接 Redis 并消费队列
- 因此本地需要提供可访问的 Redis

## 4. 根目录统一命令

先在仓库根目录安装两个子应用依赖：

```bash
pnpm run setup
```

根目录当前提供这几个统一入口：

- `pnpm run setup`：依次执行 `apps/web` 和 `apps/worker` 的 `pnpm install`
- `pnpm run dev:web`：只启动 `apps/web`
- `pnpm run dev:worker`：只启动 `apps/worker`
- `pnpm run dev`：同时启动 `web` 与 `worker`；任一子进程退出时，脚本会清理另一个子进程并结束

这些命令都委托给根目录 `scripts/*.sh`，方便后续继续扩展。

## 4.1 环境变量基线

建议先从仓库根目录 `.env.example` 复制出本地 `.env`，再按环境填入真实值。

当前代码已经识别的变量如下：

| 变量名 | 用途 | 归属 | 本地开发 | 部署环境 | 默认值 |
| --- | --- | --- | --- | --- | --- |
| `SUPABASE_URL` | Supabase 项目 URL | web / worker | 必填 | 必填 | 无 |
| `SUPABASE_ANON_KEY` | Supabase 匿名访问 key | web / worker | 必填 | 必填 | 无 |
| `SUPABASE_SERVICE_ROLE_KEY` | 服务端 Supabase key | web / worker | 必填 | 必填 | 无 |
| `WEBHOOK_SECRET` | webhook 签名密钥 | web / worker | 必填 | 必填 | 无 |
| `DEFAULT_MODEL_PROVIDER` | 默认模型 provider | web / worker / ai | 必填 | 必填 | 无 |
| `DEFAULT_MODEL_NAME` | 默认模型名称 | web / worker / ai | 必填 | 必填 | 无 |
| `REDIS_URL` | Redis 连接串 | web / worker | 可选 | 建议必填 | `redis://127.0.0.1:6379` |
| `REVIEW_QUEUE_NAME` | BullMQ 队列名 | web / worker | 可选 | 可选 | `review-jobs` |

说明：

- `web` 当前通过服务端模块早期校验上述变量；缺失关键变量时会直接报错
- `worker` 在启动最前面校验上述变量，再继续检查 Redis 可达性
- `packages/ai` 当前提供 provider 配置入口，复用 `DEFAULT_MODEL_PROVIDER` 与 `DEFAULT_MODEL_NAME`

## 5. 本地启动

### 5.1 启动 Web

如果已经执行过根目录安装，可以直接启动：

```bash
pnpm run dev:web
```

等价底层命令是：

```bash
pnpm --dir apps/web run dev
```

默认访问地址：

- `http://localhost:3000`

如果需要生产模式本地验证：

```bash
pnpm --dir apps/web run build
pnpm --dir apps/web run start
```

### 5.2 启动 Worker

如果已经执行过根目录安装，可以直接启动：

```bash
pnpm run dev:worker
```

等价底层命令是：

```bash
pnpm --dir apps/worker run dev
```

通过根目录脚本启动时，会优先加载仓库根目录 `.env`；建议先复制 `.env.example`。如果没有显式配置，则本地开发默认使用：

- `REDIS_URL=redis://127.0.0.1:6379`
- `REVIEW_QUEUE_NAME=review-jobs`

也就是说，直接执行根目录的 `pnpm run dev` 或 `pnpm run dev:worker` 时，worker 会尝试连接本机 Redis 并消费队列；如果 Redis 不可达，worker 会立即失败退出，而不是进入静默 fallback。

### 5.3 启动 Worker（连接真实 Redis）

如果要覆盖默认的本地开发配置，可以在启动前提供环境变量。

示例：

```bash
export REDIS_URL="redis://:your-password@your-redis-host:6379"
export REVIEW_QUEUE_NAME="review-jobs"

pnpm run dev:worker
```

说明：

- `REDIS_URL`：Redis 连接串；不显式配置时默认值是 `redis://127.0.0.1:6379`
- `REVIEW_QUEUE_NAME`：队列名，默认值是 `review-jobs`
- 默认值只是减少本地开发配置，不代表 Redis 可以缺失；Redis 不可达时 worker 会 fail fast

如果你要用构建产物运行：

```bash
pnpm --dir apps/worker run build
export REDIS_URL="redis://:your-password@your-redis-host:6379"
export REVIEW_QUEUE_NAME="review-jobs"
pnpm --dir apps/worker run start
```

## 6. 同时启动 Web 与 Worker

最方便的方式是在仓库根目录直接执行：

```bash
pnpm run dev
```

这个命令会通过 `scripts/dev.sh` 同时拉起：

- `apps/web`
- `apps/worker`

行为说明：

- 如果两个服务都正常运行，脚本会持续驻留
- 如果其中一个服务退出，脚本会主动终止另一个服务，避免残留孤儿进程
- 如果其中一个服务以非零状态退出，`pnpm run dev` 也会以相同失败码退出，方便在本地或 CI 中尽早暴露问题
- 如果需要覆盖默认配置，请在执行 `pnpm run dev` 前先导出 `REDIS_URL`、`REVIEW_QUEUE_NAME`

如果你更希望分开调试，也可以分别执行：

```bash
pnpm run dev:web
pnpm run dev:worker
```

## 7. 构建与生产启动

### 7.1 Web

构建：

```bash
pnpm --dir apps/web run build
```

生产启动：

```bash
pnpm --dir apps/web run start
```

### 7.2 Worker

构建：

```bash
pnpm --dir apps/worker run build
```

生产启动：

```bash
export REDIS_URL="redis://:your-password@your-redis-host:6379"
export REVIEW_QUEUE_NAME="review-jobs"
pnpm --dir apps/worker run start
```

说明：

- 代码在未显式配置时仍会回落到默认 `REDIS_URL` 与 `REVIEW_QUEUE_NAME`
- 生产环境不建议依赖默认 localhost；应显式配置可达的 Redis 地址
- worker 启动时会先验证 Redis 可达性，不可达时立即失败退出

## 8. 部署建议

结合当前技术选型文档，建议把两个服务拆开部署：

### 7.1 Web 服务

建议部署为长期在线的 HTTP 服务，例如：

- `Vercel`
- `Railway`
- `Fly.io`
- 自建 `Node.js` 主机 / 容器环境

Web 当前职责：

- 提供 Next.js 页面
- 承载后续的 BFF / Route Handlers
- 承载后续的控制台入口

### 7.2 Worker 服务

建议部署为长期运行的后台进程，例如：

- `Railway Worker`
- `Fly.io` machine / app
- `ECS`
- `k8s`
- 任何可以长期运行 `node dist/index.js` 的环境

Worker 当前职责：

- 启动 BullMQ Worker
- 连接 Redis
- 消费占位任务处理器

部署要求：

- `SUPABASE_URL`、`SUPABASE_ANON_KEY`、`SUPABASE_SERVICE_ROLE_KEY`、`WEBHOOK_SECRET`、`DEFAULT_MODEL_PROVIDER`、`DEFAULT_MODEL_NAME` 需要在部署前完整配置
- 目标环境中的 Redis 必须可达，否则 worker 会在启动时立即失败退出
- 建议显式配置 `REDIS_URL`
- `REVIEW_QUEUE_NAME` 可选，默认值是 `review-jobs`

## 8. 推荐部署流程

### 8.1 Web

```bash
pnpm run setup
pnpm --dir apps/web run build
pnpm --dir apps/web run start
```

### 8.2 Worker

```bash
pnpm run setup
pnpm --dir apps/worker run build
export REDIS_URL="redis://:your-password@your-redis-host:6379"
export REVIEW_QUEUE_NAME="review-jobs"
pnpm --dir apps/worker run start
```

## 9. 当前已知限制

当前文档描述的是“已落地代码”的启动与部署方式，下面这些点也需要明确：

- 根目录已经有统一开发脚本，但还不是完整的 `pnpm workspace` Monorepo 管理
- `apps/worker` 目前还是占位消费逻辑，尚未接入完整的 PR 审查主链路
- `apps/web` 与 `apps/worker` 之间还没有打通真实的入队流程
- 还没有提交 `Dockerfile`、`docker-compose.yml`、CI/CD 配置或进程管理脚本
- 未来接入 `Supabase`、Webhook、AI provider 之后，部署所需环境变量会继续增加

## 10. 建议后续补充

如果下一步要把项目推进到“更容易启动和部署”的状态，建议优先补这几项：

1. 完整的 `pnpm workspace` 与共享依赖管理
2. `.env.example` 与环境变量说明
3. Web 入队与 Worker 消费的真实打通
4. `Dockerfile` / `docker-compose` / 平台部署配置
5. 生产环境日志、健康检查与重启策略
