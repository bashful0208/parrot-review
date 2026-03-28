#!/bin/sh
set -eu

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
pnpm --dir apps/web run dev &
web_pid=$!

echo "[dev] 启动 apps/worker ..."
pnpm --dir apps/worker run dev &
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
