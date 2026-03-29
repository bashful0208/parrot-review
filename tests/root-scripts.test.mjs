import test from "node:test";
import assert from "node:assert/strict";
import { chmod, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

const rootDir = "/Users/bashful/work/code/reviewer";

async function readText(relativePath) {
  return readFile(path.join(rootDir, relativePath), "utf8");
}

test("root package.json exposes shell script entrypoints", async () => {
  const packageJson = JSON.parse(await readText("package.json"));

  assert.deepEqual(packageJson.scripts, {
    setup: "sh ./scripts/setup.sh",
    dev: "sh ./scripts/dev.sh",
    "dev:web": "sh ./scripts/dev-web.sh",
    "dev:worker": "sh ./scripts/dev-worker.sh",
  });
});

test("setup script installs web and worker with pnpm", async () => {
  const script = await readText("scripts/setup.sh");

  assert.match(script, /pnpm --dir apps\/web install/);
  assert.match(script, /pnpm --dir apps\/worker install/);
});

test("single-service scripts forward to child apps", async () => {
  const webScript = await readText("scripts/dev-web.sh");
  const workerScript = await readText("scripts/dev-worker.sh");

  assert.match(webScript, /exec pnpm --dir "\$REPO_ROOT\/apps\/web" run dev/);
  assert.match(workerScript, /exec pnpm --dir "\$REPO_ROOT\/apps\/worker" run dev/);
  assert.match(webScript, /REDIS_URL:=redis:\/\/127\.0\.0\.1:6379/);
  assert.match(webScript, /REVIEW_QUEUE_NAME:=review-jobs/);
  assert.match(workerScript, /WORKER_AUTOSTART:=true/);
});

test("combined dev script starts both services and wires cleanup traps", async () => {
  const script = await readText("scripts/dev.sh");

  assert.match(script, /pnpm --dir "\$REPO_ROOT\/apps\/web" run dev \&/);
  assert.match(script, /pnpm --dir "\$REPO_ROOT\/apps\/worker" run dev \&/);
  assert.match(script, /trap 'cleanup; exit 130' INT TERM/);
  assert.match(script, /kill -0 "\$web_pid"/);
  assert.match(script, /kill -0 "\$worker_pid"/);
  assert.match(script, /REDIS_URL:=redis:\/\/127\.0\.0\.1:6379/);
  assert.match(script, /REVIEW_QUEUE_NAME:=review-jobs/);
  assert.match(script, /WORKER_AUTOSTART:=true/);
});

test("combined dev script stops the sibling process when one service exits", async () => {
  const sandboxDir = await mkdtemp(path.join(os.tmpdir(), "root-scripts-"));
  const binDir = path.join(sandboxDir, "bin");
  const logFile = path.join(sandboxDir, "worker.log");
  const fakePnpmPath = path.join(binDir, "pnpm");

  await mkdir(path.join(sandboxDir, "apps", "web"), { recursive: true });
  await mkdir(path.join(sandboxDir, "apps", "worker"), { recursive: true });
  await mkdir(binDir, { recursive: true });

  await writeFile(
    fakePnpmPath,
    `#!/bin/sh
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
`,
  );
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

  assert.equal(exitCode, 0);

  const logContents = await readFile(logFile, "utf8");

  assert.match(logContents, /worker-started/);
  assert.match(logContents, /worker-stopped/);
});
