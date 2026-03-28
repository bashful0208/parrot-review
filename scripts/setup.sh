#!/bin/sh
set -eu

echo "[setup] 安装 apps/web 依赖..."
pnpm --dir apps/web install

echo "[setup] 安装 apps/worker 依赖..."
pnpm --dir apps/worker install

echo "[setup] 完成。"
