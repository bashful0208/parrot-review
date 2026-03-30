import test from "node:test";
import { access, rename, rm } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import path from "node:path";

const coreDistDir = path.join(process.cwd(), "packages/core/dist");
const hiddenCoreDistDir = path.join(process.cwd(), "packages/core/.dist-hidden-for-test");

async function pathExists(targetPath) {
  try {
    await access(targetPath);
    return true;
  } catch {
    return false;
  }
}

test("worker runtime can import @reviewer/core when committed core dist is missing", async () => {
  await rename(coreDistDir, hiddenCoreDistDir);

  try {
    execFileSync(
      "pnpm",
      [
        "--dir",
        "apps/worker",
        "exec",
        "tsx",
        "--tsconfig",
        "tsconfig.dev.json",
        "--eval",
        "const mod = await import('@reviewer/core'); if (typeof mod.buildWorkerConfig !== 'function') throw new Error('buildWorkerConfig export missing')",
      ],
      { cwd: process.cwd(), stdio: "pipe" },
    );
  } finally {
    if (await pathExists(hiddenCoreDistDir)) {
      if (await pathExists(coreDistDir)) {
        await rm(coreDistDir, { recursive: true, force: true });
      }

      await rename(hiddenCoreDistDir, coreDistDir);
    }
  }
});
