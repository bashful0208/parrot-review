#!/bin/sh
set -eu

echo "[dev-worker] 启动 apps/worker ..."
exec pnpm --dir apps/worker run dev
