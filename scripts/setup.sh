#!/bin/sh
set -eu

echo "[setup] 安装 apps/web 依赖..."
pnpm --dir apps/web install

echo "[setup] 安装 apps/worker 依赖..."
pnpm --dir apps/worker install

echo "[setup] 安装 packages/core 依赖..."
pnpm --dir packages/core install

echo "[setup] 安装 packages/ai 依赖..."
pnpm --dir packages/ai install

echo "[setup] 安装 packages/git 依赖..."
pnpm --dir packages/git install

echo "[setup] 安装 packages/db-types 依赖..."
pnpm --dir packages/db-types install

echo "[setup] 完成。"
