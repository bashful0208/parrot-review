#!/bin/sh
set -eu

echo "[dev-web] 启动 apps/web ..."
exec pnpm --dir apps/web run dev
