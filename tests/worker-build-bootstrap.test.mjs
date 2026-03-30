import test from "node:test";
import { access } from "node:fs/promises";
import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import {
  coreDistDir,
  repoRoot,
  withMissingCoreDist,
} from "./helpers/core-dist-fixture.mjs";

const execFileAsync = promisify(execFile);
const hiddenCoreDistDir = path.join(repoRoot, "packages/core/.dist-hidden-for-worker-build-test");
const coreDistEntry = path.join(coreDistDir, "index.js");

test("worker build regenerates core dist when committed artifacts are missing", async () => {
  await withMissingCoreDist(hiddenCoreDistDir, async () => {
    await execFileAsync("pnpm", ["--dir", "apps/worker", "run", "build"], {
      cwd: repoRoot,
    });

    await access(coreDistEntry);
  });
});
