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
const hiddenCoreDistDir = path.join(repoRoot, "packages/core/.dist-hidden-for-web-build-test");
const coreDistEntry = path.join(coreDistDir, "index.js");

test("web build regenerates core dist when committed artifacts are missing", async () => {
  await withMissingCoreDist(hiddenCoreDistDir, async () => {
    await execFileAsync("pnpm", ["--dir", "apps/web", "run", "build"], {
      cwd: repoRoot,
    });

    await access(coreDistEntry);
  });
});
