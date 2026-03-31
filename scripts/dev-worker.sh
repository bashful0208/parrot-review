#!/bin/sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
REPO_ROOT=$(dirname "$SCRIPT_DIR")

if [ ! -f "$REPO_ROOT/.env" ] && [ -f "$REPO_ROOT/.env.example" ]; then
  cp "$REPO_ROOT/.env.example" "$REPO_ROOT/.env"
fi

if [ -f "$REPO_ROOT/.env" ]; then
  set -a
  . "$REPO_ROOT/.env"
  set +a
fi

: "${REDIS_URL:=redis://127.0.0.1:6379}"
: "${REVIEW_QUEUE_NAME:=review-jobs}"
export REDIS_URL REVIEW_QUEUE_NAME

echo "[dev-worker] 启动 apps/worker ..."
exec pnpm --dir "$REPO_ROOT/apps/worker" run dev
