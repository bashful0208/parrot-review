# Pnpm Root Scripts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在仓库根目录新增一组基于 `sh` 的脚本，统一完成 `apps/web` 与 `apps/worker` 的 `pnpm install`、单服务启动和双服务联动启动。

**Architecture:** 保持当前仓库结构不变，不引入 `pnpm-workspace.yaml`。在根目录新增 `scripts/` 放置 `setup.sh`、`dev.sh`、`dev-web.sh`、`dev-worker.sh`，再用根目录 `package.json` 暴露统一入口；并更新启动文档，反映新的根目录启动方式。

**Tech Stack:** `pnpm`, POSIX shell (`sh`), Node.js child processes via shell background jobs, Next.js 16, BullMQ worker

---

## File Map

- Create: `package.json`
  - 根目录命令入口，暴露 `pnpm run setup`、`pnpm run dev`、`pnpm run dev:web`、`pnpm run dev:worker`
- Create: `scripts/setup.sh`
  - 顺序执行两个子项目的 `pnpm install`
- Create: `scripts/dev-web.sh`
  - 启动 `apps/web`
- Create: `scripts/dev-worker.sh`
  - 启动 `apps/worker`
- Create: `scripts/dev.sh`
  - 并行启动 web 与 worker，并在退出时清理子进程
- Modify: `doc/startup-and-deployment.md`
  - 补充根目录 `scripts/` 与 `pnpm` 统一入口说明

### Task 1: Add root package entrypoints

**Files:**
- Create: `package.json`

- [ ] **Step 1: Write the failing verification expectation**

在根目录先确认当前没有 `package.json`，因此无法使用 `pnpm run setup` 或 `pnpm run dev`。

- [ ] **Step 2: Run verification to confirm the missing root entrypoint**

Run: `ls -la /Users/bashful/work/code/reviewer`
Expected: 看不到根目录 `package.json`

- [ ] **Step 3: Write the minimal root manifest**

创建 `package.json`，内容只包含当前任务需要的脚本：

```json
{
  "name": "reviewer-root",
  "private": true,
  "scripts": {
    "setup": "sh ./scripts/setup.sh",
    "dev": "sh ./scripts/dev.sh",
    "dev:web": "sh ./scripts/dev-web.sh",
    "dev:worker": "sh ./scripts/dev-worker.sh"
  }
}
```

- [ ] **Step 4: Verify the root manifest shape**

Run: `node -e "const pkg=require('/Users/bashful/work/code/reviewer/package.json'); console.log(Object.keys(pkg.scripts).join(','))"`
Expected: 输出 `setup,dev,dev:web,dev:worker`

### Task 2: Add shell scripts under scripts/

**Files:**
- Create: `scripts/setup.sh`
- Create: `scripts/dev-web.sh`
- Create: `scripts/dev-worker.sh`
- Create: `scripts/dev.sh`

- [ ] **Step 1: Write the failing verification expectation**

确认根目录目前还没有 `scripts/` 目录和这些 `.sh` 文件。

- [ ] **Step 2: Run verification to confirm the scripts are missing**

Run: `ls -la /Users/bashful/work/code/reviewer/scripts`
Expected: 目录不存在或命令失败

- [ ] **Step 3: Write the minimal script implementations**

实现以下脚本：

```sh
# scripts/setup.sh
set -eu

echo "[setup] 安装 apps/web 依赖..."
pnpm --dir apps/web install

echo "[setup] 安装 apps/worker 依赖..."
pnpm --dir apps/worker install

echo "[setup] 完成。"
```

```sh
# scripts/dev-web.sh
set -eu

echo "[dev-web] 启动 apps/web ..."
exec pnpm --dir apps/web run dev
```

```sh
# scripts/dev-worker.sh
set -eu

echo "[dev-worker] 启动 apps/worker ..."
exec pnpm --dir apps/worker run dev
```

```sh
# scripts/dev.sh
set -eu

cleanup() {
  code=$?
  trap - INT TERM EXIT

  if [ -n "${web_pid:-}" ] && kill -0 "$web_pid" 2>/dev/null; then
    kill "$web_pid" 2>/dev/null || true
  fi

  if [ -n "${worker_pid:-}" ] && kill -0 "$worker_pid" 2>/dev/null; then
    kill "$worker_pid" 2>/dev/null || true
  fi

  wait 2>/dev/null || true
  exit "$code"
}

trap cleanup INT TERM EXIT

echo "[dev] 启动 apps/web ..."
pnpm --dir apps/web run dev &
web_pid=$!

echo "[dev] 启动 apps/worker ..."
pnpm --dir apps/worker run dev &
worker_pid=$!

wait
```

- [ ] **Step 4: Verify shell syntax**

Run: `sh -n /Users/bashful/work/code/reviewer/scripts/setup.sh && sh -n /Users/bashful/work/code/reviewer/scripts/dev-web.sh && sh -n /Users/bashful/work/code/reviewer/scripts/dev-worker.sh && sh -n /Users/bashful/work/code/reviewer/scripts/dev.sh`
Expected: 无输出且退出码为 0

### Task 3: Verify install and startup commands

**Files:**
- Verify: `package.json`
- Verify: `scripts/setup.sh`
- Verify: `scripts/dev.sh`
- Verify: `scripts/dev-web.sh`
- Verify: `scripts/dev-worker.sh`

- [ ] **Step 1: Verify `setup` wiring before running installs**

Run: `pnpm --dir /Users/bashful/work/code/reviewer run setup --help`
Expected: 能解析到根目录脚本入口（若 `pnpm` 不支持 `--help`，则改用 `pnpm --dir /Users/bashful/work/code/reviewer run setup` 实跑）

- [ ] **Step 2: Run the install script**

Run: `pnpm --dir /Users/bashful/work/code/reviewer run setup`
Expected: `apps/web` 与 `apps/worker` 都完成安装

- [ ] **Step 3: Verify single-service startup entrypoints**

Run: `pnpm --dir /Users/bashful/work/code/reviewer run dev:web` 与 `pnpm --dir /Users/bashful/work/code/reviewer run dev:worker`
Expected: 两个命令都能成功拉起各自服务（可用短时后台运行验证）

- [ ] **Step 4: Verify dual-service startup entrypoint**

Run: `pnpm --dir /Users/bashful/work/code/reviewer run dev`
Expected: 同时看到 web 与 worker 的启动输出；手动终止后两个子进程均退出

### Task 4: Update startup documentation

**Files:**
- Modify: `doc/startup-and-deployment.md`

- [ ] **Step 1: Write the failing documentation expectation**

确认文档仍写着“当前没有根目录统一脚本”。

- [ ] **Step 2: Verify the stale documentation text**

Run: `rg -n "还没有根目录|没有根目录统一脚本|统一脚本" /Users/bashful/work/code/reviewer/doc/startup-and-deployment.md`
Expected: 能搜到旧描述

- [ ] **Step 3: Update the document minimally**

把文档更新为当前实际状态：
- 根目录新增 `scripts/`
- 可使用根目录 `pnpm run setup`
- 可使用根目录 `pnpm run dev`
- 保留对子项目单独启动方式的说明

- [ ] **Step 4: Verify the updated documentation**

Run: `rg -n "pnpm run setup|pnpm run dev|scripts/" /Users/bashful/work/code/reviewer/doc/startup-and-deployment.md`
Expected: 能看到新的根目录入口说明

### Task 5: Final verification

**Files:**
- Verify all files above

- [ ] **Step 1: Re-run shell syntax verification**

Run: `sh -n /Users/bashful/work/code/reviewer/scripts/setup.sh && sh -n /Users/bashful/work/code/reviewer/scripts/dev-web.sh && sh -n /Users/bashful/work/code/reviewer/scripts/dev-worker.sh && sh -n /Users/bashful/work/code/reviewer/scripts/dev.sh`
Expected: 全部通过

- [ ] **Step 2: Re-run startup verification commands**

Run: `pnpm --dir /Users/bashful/work/code/reviewer run setup`
Expected: 安装脚本仍可正常执行

- [ ] **Step 3: Re-run dual-service start smoke test**

Run: `pnpm --dir /Users/bashful/work/code/reviewer run dev`
Expected: web 与 worker 均被拉起，终止后无残留子进程

- [ ] **Step 4: Review changed files together**

Run: `ls -la /Users/bashful/work/code/reviewer && ls -la /Users/bashful/work/code/reviewer/scripts`
Expected: 能看到根目录 `package.json` 与 `scripts/*.sh`
