import test from "node:test";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { repoRoot, withMissingCoreDist } from "./helpers/core-dist-fixture.mjs";

const hiddenCoreDistDir = path.join(
  repoRoot,
  "packages/core/.dist-hidden-for-test"
);

test("worker runtime can import @reviewer/core when committed core dist is missing", async () => {
  await withMissingCoreDist(hiddenCoreDistDir, async () => {
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
      { cwd: repoRoot, stdio: "pipe" }
    );
  });
});
