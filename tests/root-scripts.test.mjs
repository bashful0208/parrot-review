import test from "node:test";
import assert from "node:assert/strict";
import { chmod, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const testFileDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(testFileDir, "..");

async function readText(relativePath) {
  return readFile(path.join(rootDir, relativePath), "utf8");
}

async function runDevScriptWithFakePnpm(fakePnpmSource) {
  const sandboxDir = await mkdtemp(path.join(os.tmpdir(), "root-scripts-"));
  const binDir = path.join(sandboxDir, "bin");
  const logFile = path.join(sandboxDir, "worker.log");
  const fakePnpmPath = path.join(binDir, "pnpm");

  await mkdir(path.join(sandboxDir, "apps", "web"), { recursive: true });
  await mkdir(path.join(sandboxDir, "apps", "worker"), { recursive: true });
  await mkdir(binDir, { recursive: true });

  await writeFile(fakePnpmPath, fakePnpmSource);
  await chmod(fakePnpmPath, 0o755);

  const child = spawn("sh", [path.join(rootDir, "scripts", "dev.sh")], {
    cwd: sandboxDir,
    env: {
      ...process.env,
      FAKE_LOG: logFile,
      PATH: `${binDir}:${process.env.PATH ?? ""}`,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  const exitCode = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error("dev.sh did not stop after the first child exited"));
    }, 5000);

    child.once("exit", (code) => {
      clearTimeout(timeout);
      resolve(code);
    });
    child.once("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
  });

  let logContents = "";
  try {
    logContents = await readFile(logFile, "utf8");
  } catch {
    logContents = "";
  }

  return { exitCode, logContents };
}

test("root package.json exposes shell script entrypoints", async () => {
  const packageJson = JSON.parse(await readText("package.json"));

  assert.deepEqual(packageJson.scripts, {
    setup: "sh ./scripts/setup.sh",
    test: "node --test tests/*.test.mjs && pnpm -r --if-present run test",
    build:
      "pnpm --dir packages/core run build && pnpm --dir apps/web run build && pnpm --dir apps/worker run build",
    dev: "sh ./scripts/dev.sh",
    "dev:web": "sh ./scripts/dev-web.sh",
    "dev:worker": "sh ./scripts/dev-worker.sh",
    lint: "pnpm -r run lint",
    typecheck: "pnpm -r run typecheck",
    format: "prettier --write .",
    "format:check": "prettier --check .",
    check: "pnpm lint && pnpm typecheck && pnpm test",
  });
});

test("setup script installs workspace packages with pnpm", async () => {
  const script = await readText("scripts/setup.sh");

  assert.match(script, /pnpm --dir apps\/web install/);
  assert.match(script, /pnpm --dir apps\/worker install/);
  assert.match(script, /pnpm --dir packages\/core install/);
  assert.match(script, /pnpm --dir packages\/ai install/);
  assert.match(script, /pnpm --dir packages\/git install/);
  assert.match(script, /pnpm --dir packages\/db-types install/);
});

test("single-service scripts forward to child apps", async () => {
  const webScript = await readText("scripts/dev-web.sh");
  const workerScript = await readText("scripts/dev-worker.sh");

  assert.match(webScript, /exec pnpm --dir "\$REPO_ROOT\/apps\/web" run dev/);
  assert.match(
    workerScript,
    /exec pnpm --dir "\$REPO_ROOT\/apps\/worker" run dev/
  );
  assert.match(webScript, /REDIS_URL:=redis:\/\/127\.0\.0\.1:6379/);
  assert.match(webScript, /REVIEW_QUEUE_NAME:=review-jobs/);
  assert.match(
    workerScript,
    /DATABASE_URL:=postgresql:\/\/postgres:Ccc12345\.\.@127\.0\.0\.1:5432\/postgres/
  );
});

test("dev-worker script bootstraps missing .env from .env.example", async () => {
  const workerScript = await readText("scripts/dev-worker.sh");

  assert.match(
    workerScript,
    /if \[ ! -f "\$REPO_ROOT\/.env" \] && \[ -f "\$REPO_ROOT\/.env\.example" \]; then/
  );
  assert.match(workerScript, /cp "\$REPO_ROOT\/.env\.example" "\$REPO_ROOT\/.env"/);
});

test("combined dev script starts both services and wires cleanup traps", async () => {
  const script = await readText("scripts/dev.sh");

  assert.match(script, /pnpm --dir "\$REPO_ROOT\/apps\/web" run dev &/);
  assert.match(script, /pnpm --dir "\$REPO_ROOT\/apps\/worker" run dev &/);
  assert.match(script, /trap 'cleanup; exit 130' INT TERM/);
  assert.match(script, /kill -0 "\$web_pid"/);
  assert.match(script, /kill -0 "\$worker_pid"/);
  assert.match(script, /REDIS_URL:=redis:\/\/127\.0\.0\.1:6379/);
  assert.match(script, /REVIEW_QUEUE_NAME:=review-jobs/);
});

test("combined dev script stops the sibling process when one service exits", async () => {
  const { exitCode, logContents } = await runDevScriptWithFakePnpm(`#!/bin/sh
set -eu

if [ "$1" != "--dir" ]; then
  exit 2
fi

case "$2" in
  */apps/web)
    echo "web-started"
    sleep 1
    exit 0
    ;;
  */apps/worker)
    trap 'echo worker-stopped >> "$FAKE_LOG"; exit 0' TERM INT
    echo worker-started >> "$FAKE_LOG"
    while :; do
      sleep 1
    done
    ;;
  *)
    exit 3
    ;;
esac
`);

  assert.equal(exitCode, 0);
  assert.match(logContents, /worker-started/);
  assert.match(logContents, /worker-stopped/);
});

test("combined dev script returns the web failure exit code", async () => {
  const { exitCode, logContents } = await runDevScriptWithFakePnpm(`#!/bin/sh
set -eu

if [ "$1" != "--dir" ]; then
  exit 2
fi

case "$2" in
  */apps/web)
    exit 17
    ;;
  */apps/worker)
    trap 'echo worker-stopped >> "$FAKE_LOG"; exit 0' TERM INT
    echo worker-started >> "$FAKE_LOG"
    while :; do
      sleep 1
    done
    ;;
  *)
    exit 3
    ;;
esac
`);

  assert.equal(exitCode, 17);
  assert.match(logContents, /worker-started/);
  assert.match(logContents, /worker-stopped/);
});

test("combined dev script returns the worker failure exit code", async () => {
  const { exitCode } = await runDevScriptWithFakePnpm(`#!/bin/sh
set -eu

if [ "$1" != "--dir" ]; then
  exit 2
fi

case "$2" in
  */apps/web)
    trap 'exit 0' TERM INT
    while :; do
      sleep 1
    done
    ;;
  */apps/worker)
    exit 23
    ;;
  *)
    exit 3
    ;;
esac
`);

  assert.equal(exitCode, 23);
});
