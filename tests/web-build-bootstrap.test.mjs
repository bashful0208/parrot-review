import test from "node:test";
import assert from "node:assert/strict";
import { access, rename, rm } from "node:fs/promises";
import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const repoRoot = process.cwd();
const coreDistDir = path.join(repoRoot, "packages/core/dist");
const hiddenCoreDistDir = path.join(repoRoot, "packages/core/.dist-hidden-for-web-build-test");
const coreDistEntry = path.join(coreDistDir, "index.js");

async function pathExists(targetPath) {
  try {
    await access(targetPath);
    return true;
  } catch {
    return false;
  }
}

test("web build regenerates core dist when committed artifacts are missing", async () => {
  await rename(coreDistDir, hiddenCoreDistDir);

  try {
    await execFileAsync("pnpm", ["--dir", "apps/web", "run", "build"], {
      cwd: repoRoot,
    });

    await access(coreDistEntry);
    assert.ok(true);
  } finally {
    if (await pathExists(hiddenCoreDistDir)) {
      if (await pathExists(coreDistDir)) {
        await rm(coreDistDir, { recursive: true, force: true });
      }

      await rename(hiddenCoreDistDir, coreDistDir);
    }
  }
});
