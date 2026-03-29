#!/bin/sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
REPO_ROOT=$(dirname "$SCRIPT_DIR")

if [ -f "$REPO_ROOT/.env" ]; then
  set -a
  . "$REPO_ROOT/.env"
  set +a
fi

: "${REDIS_URL:=redis://127.0.0.1:6379}"
: "${REVIEW_QUEUE_NAME:=review-jobs}"
export REDIS_URL REVIEW_QUEUE_NAME

echo "[dev-web] 启动 apps/web ..."
exec pnpm --dir "$REPO_ROOT/apps/web" run dev
