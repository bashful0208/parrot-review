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

只启动 Web：

```bash
pnpm run dev:web
```

只启动 Worker：

```bash
pnpm run dev:worker
```
