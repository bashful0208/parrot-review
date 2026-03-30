# Test Stability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `pnpm test` pass by fixing stale test assumptions and test setup, without changing unrelated product behavior.

**Architecture:** Keep all changes on the test side. Replace machine-specific path assumptions with repository-root-relative resolution, update script assertions to match the current root package contract, and make `core/dist`-dependent tests prepare their own build preconditions before validating missing-dist behavior.

**Tech Stack:** Node.js test runner, `pnpm`, ESM test files, shell scripts, filesystem fixtures

---

## File Structure

- Modify: `tests/basic-engineering.test.mjs`
  - Stop reading from a hard-coded historical worktree path.
  - Read files from the current repository root.
- Modify: `tests/root-scripts.test.mjs`
  - Update root script assertions to match the current `package.json`.
- Create: `tests/helpers/core-dist-fixture.mjs`
  - Centralize `packages/core/dist` existence checks, bootstrap build, hide/restore helpers.
- Modify: `tests/core-no-dist-workspace.test.mjs`
  - Prepare `packages/core/dist` before renaming it away.
- Modify: `tests/web-build-bootstrap.test.mjs`
  - Prepare `packages/core/dist` before validating web build bootstrap behavior.
- Modify: `tests/worker-build-bootstrap.test.mjs`
  - Prepare `packages/core/dist` before validating worker build bootstrap behavior.

### Task 1: Stabilize Repository-Root Test Assumptions

**Files:**

- Modify: `tests/basic-engineering.test.mjs`
- Test: `tests/basic-engineering.test.mjs`

- [ ] **Step 1: Write the failing test expectation update**

Replace the hard-coded root path setup with repository-relative resolution:

```js
const rootDir = process.cwd();

async function readText(relativePath) {
  return readFile(path.join(rootDir, relativePath), "utf8");
}
```

Keep the existing assertions that verify root scripts and workspace package stubs.

- [ ] **Step 2: Run the focused test to verify the current failure**

Run: `pnpm test -- --test-name-pattern "root package exposes unified engineering scripts|workspace package stubs exist for P0 foundation"`
Expected: FAIL with `ENOENT` pointing to `.claude/worktrees/p0-foundation`

- [ ] **Step 3: Write the minimal implementation change**

Update `tests/basic-engineering.test.mjs` from this:

```js
const rootDir =
  "/Users/bashful/work/code/reviewer/.claude/worktrees/p0-foundation";
```

To this:

```js
const rootDir = process.cwd();
```

Leave the rest of the file unchanged unless another absolute-path assumption appears.

- [ ] **Step 4: Run the focused test to verify it passes**

Run: `pnpm test -- --test-name-pattern "root package exposes unified engineering scripts|workspace package stubs exist for P0 foundation"`
Expected: PASS for both tests

- [ ] **Step 5: Commit**

```bash
git add tests/basic-engineering.test.mjs
git commit -m "$(cat <<'EOF'
fix: stabilize repository root tests

Remove the hard-coded worktree path from the engineering tests.
Make the assertions run against the current repository root.
EOF
)"
```

### Task 2: Refresh Root Script Contract Assertions

**Files:**

- Modify: `tests/root-scripts.test.mjs`
- Test: `tests/root-scripts.test.mjs`

- [ ] **Step 1: Write the failing assertion update**

Update the expected script map so it matches the current root `package.json`:

```js
assert.deepEqual(packageJson.scripts, {
  setup: "sh ./scripts/setup.sh",
  test: "node --test tests/*.test.mjs",
  build:
    "pnpm --dir packages/core run build && pnpm --dir apps/web run build && pnpm --dir apps/worker run build",
  dev: "sh ./scripts/dev.sh",
  "dev:web": "sh ./scripts/dev-web.sh",
  "dev:worker": "sh ./scripts/dev-worker.sh",
  lint: "pnpm -r run lint",
  typecheck: "pnpm -r run typecheck",
  "format:check": "prettier --check .",
});
```

- [ ] **Step 2: Run the focused test to verify the current failure**

Run: `pnpm test -- --test-name-pattern "root package.json exposes shell script entrypoints"`
Expected: FAIL with a deep-equal diff showing missing `lint`, `typecheck`, `format:check`, and the outdated `build` script

- [ ] **Step 3: Write the minimal implementation change**

Replace the stale expected object in `tests/root-scripts.test.mjs` with the updated one above. Do not loosen the test into partial matching.

- [ ] **Step 4: Run the focused test to verify it passes**

Run: `pnpm test -- --test-name-pattern "root package.json exposes shell script entrypoints"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add tests/root-scripts.test.mjs
git commit -m "$(cat <<'EOF'
fix: refresh root script test contract

Update the root script assertion to match the current workspace commands.
Keep the test strict while removing stale expectations.
EOF
)"
```

### Task 3: Add Shared `core/dist` Test Fixture Helpers

**Files:**

- Create: `tests/helpers/core-dist-fixture.mjs`
- Test: `tests/core-no-dist-workspace.test.mjs`
- Test: `tests/web-build-bootstrap.test.mjs`
- Test: `tests/worker-build-bootstrap.test.mjs`

- [ ] **Step 1: Write the failing helper design**

Create a focused helper module with four functions:

```js
import { execFileSync } from "node:child_process";
import { access, rename, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const helpersDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(helpersDir, "../..");
const packagesDir = path.join(repoRoot, "packages");
const corePackageDir = path.join(packagesDir, "core");
const coreDistDir = path.join(corePackageDir, "dist");

export async function pathExists(targetPath) {
  try {
    await access(targetPath);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") {
      return false;
    }

    throw error;
  }
}

export function buildCoreDist() {
  try {
    execFileSync("pnpm", ["--dir", "packages/core", "run", "build"], {
      cwd: repoRoot,
      stdio: "pipe",
      encoding: "utf8",
    });
  } catch (error) {
    const details = [
      `Failed to build packages/core from ${repoRoot}`,
      error.stdout?.trim(),
      error.stderr?.trim(),
      error.message,
    ]
      .filter(Boolean)
      .join("\n\n");

    throw new Error(details, { cause: error });
  }
}

export async function ensureCoreDistExists() {
  if (!(await pathExists(coreDistDir))) {
    buildCoreDist();
  }
}

export async function restoreRenamedDir(hiddenDir) {
  if (await pathExists(hiddenDir)) {
    const resolvedCoreDistDir = path.resolve(coreDistDir);
    const expectedDistDir = path.join(corePackageDir, "dist");

    if (
      resolvedCoreDistDir !== expectedDistDir ||
      path.dirname(resolvedCoreDistDir) !== corePackageDir ||
      path.relative(packagesDir, resolvedCoreDistDir).startsWith("..")
    ) {
      throw new Error(
        `Refusing to remove unexpected dist path: ${resolvedCoreDistDir}`
      );
    }

    if (await pathExists(coreDistDir)) {
      await rm(coreDistDir, { recursive: true, force: true });
    }

    await rename(hiddenDir, coreDistDir);
  }
}

export { repoRoot, coreDistDir };
```

- [ ] **Step 2: Run one failing `dist`-dependent test to verify the current failure**

Run: `pnpm test -- --test-name-pattern "worker runtime can import @reviewer/core when committed core dist is missing"`
Expected: FAIL with `ENOENT` when renaming `packages/core/dist`

- [ ] **Step 3: Write the helper module**

Create `tests/helpers/core-dist-fixture.mjs` with the exact code above.

- [ ] **Step 4: Verify the helper imports cleanly**

Run: `node -e "import('./tests/helpers/core-dist-fixture.mjs').then(() => console.log('ok'))"`
Expected: print `ok`

- [ ] **Step 5: Commit**

```bash
git add tests/helpers/core-dist-fixture.mjs
git commit -m "$(cat <<'EOF'
fix: add core dist test fixture helpers

Centralize core dist bootstrap and restore logic for tests.
Reduce duplicated filesystem setup across dist-dependent cases.
EOF
)"
```

### Task 4: Fix Worker Runtime Test Setup

**Files:**

- Modify: `tests/core-no-dist-workspace.test.mjs`
- Test: `tests/core-no-dist-workspace.test.mjs`

- [ ] **Step 1: Write the failing test setup change**

Refactor the test to use the shared helper and explicitly bootstrap `dist` before renaming it away:

```js
import test from "node:test";
import { execFileSync } from "node:child_process";
import path from "node:path";
import {
  coreDistDir,
  ensureCoreDistExists,
  pathExists,
  repoRoot,
  restoreRenamedDir,
} from "./helpers/core-dist-fixture.mjs";

const hiddenCoreDistDir = path.join(
  repoRoot,
  "packages/core/.dist-hidden-for-test"
);

test("worker runtime can import @reviewer/core when committed core dist is missing", async () => {
  await ensureCoreDistExists();
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
      { cwd: repoRoot, stdio: "pipe" }
    );
  } finally {
    await restoreRenamedDir(hiddenCoreDistDir);
  }
});
```

Also add the missing `rename` import from `node:fs/promises`.

- [ ] **Step 2: Run the focused test to verify the current failure**

Run: `pnpm test -- --test-name-pattern "worker runtime can import @reviewer/core when committed core dist is missing"`
Expected: FAIL with `ENOENT` before the helper-based bootstrap is added

- [ ] **Step 3: Write the minimal implementation change**

Apply these exact import updates at the top of the file:

```js
import test from "node:test";
import { rename } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import path from "node:path";
import {
  coreDistDir,
  ensureCoreDistExists,
  repoRoot,
  restoreRenamedDir,
} from "./helpers/core-dist-fixture.mjs";
```

Then replace the manual `pathExists` / `rm` recovery logic with the shared helper flow shown in Step 1.

- [ ] **Step 4: Run the focused test to verify it passes**

Run: `pnpm test -- --test-name-pattern "worker runtime can import @reviewer/core when committed core dist is missing"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add tests/core-no-dist-workspace.test.mjs tests/helpers/core-dist-fixture.mjs
git commit -m "$(cat <<'EOF'
fix: bootstrap core dist in worker runtime test

Prepare the core build output before testing the missing-dist scenario.
Keep cleanup explicit so the test remains repeatable.
EOF
)"
```

### Task 5: Fix Web and Worker Build Bootstrap Tests

**Files:**

- Modify: `tests/web-build-bootstrap.test.mjs`
- Modify: `tests/worker-build-bootstrap.test.mjs`
- Test: `tests/web-build-bootstrap.test.mjs`
- Test: `tests/worker-build-bootstrap.test.mjs`

- [ ] **Step 1: Write the failing setup change for both build tests**

Refactor both files to use the shared helper before renaming `dist` away.

For `tests/web-build-bootstrap.test.mjs`, use:

```js
import test from "node:test";
import assert from "node:assert/strict";
import { access, rename } from "node:fs/promises";
import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import {
  coreDistDir,
  ensureCoreDistExists,
  repoRoot,
  restoreRenamedDir,
} from "./helpers/core-dist-fixture.mjs";

const execFileAsync = promisify(execFile);
const hiddenCoreDistDir = path.join(
  repoRoot,
  "packages/core/.dist-hidden-for-web-build-test"
);
const coreDistEntry = path.join(coreDistDir, "index.js");

test("web build regenerates core dist when committed artifacts are missing", async () => {
  await ensureCoreDistExists();
  await rename(coreDistDir, hiddenCoreDistDir);

  try {
    await execFileAsync("pnpm", ["--dir", "apps/web", "run", "build"], {
      cwd: repoRoot,
    });

    await access(coreDistEntry);
    assert.ok(true);
  } finally {
    await restoreRenamedDir(hiddenCoreDistDir);
  }
});
```

For `tests/worker-build-bootstrap.test.mjs`, use the same pattern with the worker build command and the hidden directory name `packages/core/.dist-hidden-for-worker-build-test`.

- [ ] **Step 2: Run the focused tests to verify the current failure**

Run: `pnpm test -- --test-name-pattern "web build regenerates core dist when committed artifacts are missing|worker build regenerates core dist when committed artifacts are missing"`
Expected: FAIL with `ENOENT` when renaming `packages/core/dist`

- [ ] **Step 3: Write the minimal implementation change**

Remove the duplicated `pathExists` / `rm` helper code from both files. Import and use `ensureCoreDistExists()` and `restoreRenamedDir()` instead.

- [ ] **Step 4: Run the focused tests to verify they pass**

Run: `pnpm test -- --test-name-pattern "web build regenerates core dist when committed artifacts are missing|worker build regenerates core dist when committed artifacts are missing"`
Expected: PASS for both tests

- [ ] **Step 5: Commit**

```bash
git add tests/web-build-bootstrap.test.mjs tests/worker-build-bootstrap.test.mjs tests/helpers/core-dist-fixture.mjs
git commit -m "$(cat <<'EOF'
fix: stabilize build bootstrap tests

Make the web and worker bootstrap tests prepare their own core dist fixture.
Remove dependence on leftover build artifacts from earlier runs.
EOF
)"
```

### Task 6: Run Full Verification and Final Cleanup

**Files:**

- Verify: `tests/basic-engineering.test.mjs`
- Verify: `tests/root-scripts.test.mjs`
- Verify: `tests/core-no-dist-workspace.test.mjs`
- Verify: `tests/web-build-bootstrap.test.mjs`
- Verify: `tests/worker-build-bootstrap.test.mjs`

- [ ] **Step 1: Run the full test suite**

Run: `pnpm test`
Expected: all tests PASS

- [ ] **Step 2: Check working tree state**

Run: `git status --short`
Expected: only the intended test-file changes appear before the final commit, and the working tree is clean after the final commit

- [ ] **Step 3: Create the final integration commit**

```bash
git add tests/basic-engineering.test.mjs tests/root-scripts.test.mjs tests/helpers/core-dist-fixture.mjs tests/core-no-dist-workspace.test.mjs tests/web-build-bootstrap.test.mjs tests/worker-build-bootstrap.test.mjs
git commit -m "$(cat <<'EOF'
fix: stabilize test assumptions

Align tests with the current repository layout and script contract.
Make dist-dependent cases set up their own build preconditions.
EOF
)"
```

- [ ] **Step 4: Re-run the full test suite after the final commit**

Run: `pnpm test`
Expected: all tests PASS again
