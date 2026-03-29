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

cleanup() {
  trap - EXIT

  if [ -n "${web_pid:-}" ] && kill -0 "$web_pid" 2>/dev/null; then
    kill "$web_pid" 2>/dev/null || true
  fi

  if [ -n "${worker_pid:-}" ] && kill -0 "$worker_pid" 2>/dev/null; then
    kill "$worker_pid" 2>/dev/null || true
  fi

  wait 2>/dev/null || true
}

trap 'cleanup; exit 130' INT TERM
trap 'cleanup' EXIT

echo "[dev] 启动 apps/web ..."
pnpm --dir "$REPO_ROOT/apps/web" run dev &
web_pid=$!

echo "[dev] 启动 apps/worker ..."
pnpm --dir "$REPO_ROOT/apps/worker" run dev &
worker_pid=$!

while :; do
  if ! kill -0 "$web_pid" 2>/dev/null; then
    wait "$web_pid" 2>/dev/null || true
    break
  fi

  if ! kill -0 "$worker_pid" 2>/dev/null; then
    wait "$worker_pid" 2>/dev/null || true
    break
  fi

  sleep 1
done
