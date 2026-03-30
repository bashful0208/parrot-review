# Shared ESLint Configuration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 `apps/web` 和 `apps/worker` 建立共享 ESLint 配置，让两者都真正接入 ESLint，并保持 `typecheck` 与 `format` 职责独立。

**Architecture:** 新增 `packages/eslint-config` 作为共享 flat config 包，导出 `base` 与 `next` 两层配置。`apps/worker` 只消费 `base`，`apps/web` 消费 `next`，根目录继续通过 `pnpm -r run lint` 统一触发，各 app 自己保留独立 `typecheck`。

**Tech Stack:** pnpm workspace, ESLint flat config, eslint-config-next, TypeScript, Node.js

---

## File Structure

### New Files

- `packages/eslint-config/package.json` - 共享 ESLint 配置包声明与导出入口
- `packages/eslint-config/base.mjs` - TypeScript + Node 通用 flat config
- `packages/eslint-config/next.mjs` - 在通用配置上叠加 Next.js 规则
- `apps/worker/eslint.config.mjs` - worker 的薄封装配置，导入共享 `base`

### Modified Files

- `apps/web/eslint.config.mjs` - 改为导入共享 `next`
- `apps/worker/package.json` - 把 `lint` 改成真实 ESLint，保留 `typecheck`
- `package.json` - 如需要，补充共享 ESLint 依赖到合适位置
- `tests/basic-engineering.test.mjs` - 增加共享 ESLint 接入的工程测试
- `doc/p0-delivery-checklist.md` - 在验证通过后勾选 ESLint / TypeScript / Prettier 完成项
- `pnpm-lock.yaml` - 依赖变更后的锁文件

### Verification Targets

- `tests/basic-engineering.test.mjs`
- `apps/web/eslint.config.mjs`
- `apps/worker/eslint.config.mjs`
- `apps/worker/package.json`

### Task 1: Add Failing Engineering Tests

**Files:**

- Modify: `tests/basic-engineering.test.mjs`
- Test: `tests/basic-engineering.test.mjs`

- [ ] **Step 1: Write the failing test**

```js
import test from "node:test";
import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import path from "node:path";

const rootDir = process.cwd();

async function readText(relativePath) {
  return readFile(path.join(rootDir, relativePath), "utf8");
}

test("shared eslint config package exists", async () => {
  await access(path.join(rootDir, "packages/eslint-config/package.json"));
  await access(path.join(rootDir, "packages/eslint-config/base.mjs"));
  await access(path.join(rootDir, "packages/eslint-config/next.mjs"));
});

test("worker lint script runs eslint instead of tsc", async () => {
  const packageJson = JSON.parse(await readText("apps/worker/package.json"));

  assert.match(packageJson.scripts.lint, /eslint/);
  assert.notMatch(packageJson.scripts.lint, /tsc --noEmit/);
});

test("web eslint config imports shared next config", async () => {
  const configSource = await readText("apps/web/eslint.config.mjs");

  assert.match(
    configSource,
    /packages\/eslint-config|@reviewer\/eslint-config/
  );
  assert.match(configSource, /next/);
});

test("worker eslint config imports shared base config", async () => {
  const configSource = await readText("apps/worker/eslint.config.mjs");

  assert.match(
    configSource,
    /packages\/eslint-config|@reviewer\/eslint-config/
  );
  assert.match(configSource, /base/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/basic-engineering.test.mjs`
Expected: FAIL because `packages/eslint-config/*` and `apps/worker/eslint.config.mjs` do not exist yet, and `apps/worker/package.json` still uses `tsc --noEmit` for `lint`.

- [ ] **Step 3: Commit the failing test**

```bash
git add tests/basic-engineering.test.mjs
git commit -m "test: add shared eslint engineering checks"
```

### Task 2: Create Shared ESLint Config Package

**Files:**

- Create: `packages/eslint-config/package.json`
- Create: `packages/eslint-config/base.mjs`
- Create: `packages/eslint-config/next.mjs`
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`
- Test: `tests/basic-engineering.test.mjs`

- [ ] **Step 1: Write `packages/eslint-config/package.json`**

```json
{
  "name": "@reviewer/eslint-config",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "exports": {
    "./base": "./base.mjs",
    "./next": "./next.mjs"
  },
  "peerDependencies": {
    "eslint": "^9",
    "typescript": "^5"
  },
  "dependencies": {
    "@eslint/js": "^9.38.0",
    "typescript-eslint": "^8.46.1",
    "globals": "^16.4.0",
    "eslint-config-next": "16.2.1"
  }
}
```

- [ ] **Step 2: Write the shared base config**

```js
import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "dist/**",
      "build/**",
      ".next/**",
      "out/**",
      "coverage/**",
      "node_modules/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.ts", "**/*.tsx", "**/*.mts", "**/*.cts"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        ...globals.node,
      },
    },
    rules: {
      "no-console": "off",
    },
  }
);
```

- [ ] **Step 3: Write the shared Next.js config**

```js
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import baseConfig from "./base.mjs";

const nextConfig = [
  ...baseConfig,
  ...nextVitals,
  ...nextTs,
  {
    ignores: [".next/**", "out/**", "build/**", "next-env.d.ts"],
  },
];

export default nextConfig;
```

- [ ] **Step 4: Add shared ESLint dependencies to the workspace root if resolution requires it**

```json
{
  "devDependencies": {
    "prettier": "^3.6.2",
    "eslint": "^9.38.0",
    "typescript": "^5.9.2"
  }
}
```

Use this only if the current workspace does not already provide stable resolution for `eslint` and `typescript` through consumers.

- [ ] **Step 5: Install and refresh lockfile**

Run: `pnpm install`
Expected: `pnpm-lock.yaml` updates to include the shared ESLint package dependencies.

- [ ] **Step 6: Run the engineering test again**

Run: `node --test tests/basic-engineering.test.mjs`
Expected: still FAIL, but now only on app integration assertions (`apps/web` / `apps/worker` imports and worker lint script), proving the package exists but consumers are not wired yet.

- [ ] **Step 7: Commit shared config package scaffold**

```bash
git add package.json pnpm-lock.yaml packages/eslint-config/package.json packages/eslint-config/base.mjs packages/eslint-config/next.mjs
git commit -m "feat: add shared eslint config package"
```

### Task 3: Wire Web and Worker to Shared ESLint Config

**Files:**

- Modify: `apps/web/eslint.config.mjs`
- Create: `apps/worker/eslint.config.mjs`
- Modify: `apps/worker/package.json`
- Modify: `apps/web/package.json`
- Test: `tests/basic-engineering.test.mjs`

- [ ] **Step 1: Update `apps/web/eslint.config.mjs` to use the shared Next config**

```js
import nextConfig from "@reviewer/eslint-config/next";

export default nextConfig;
```

- [ ] **Step 2: Create `apps/worker/eslint.config.mjs` using the shared base config**

```js
import baseConfig from "@reviewer/eslint-config/base";

export default baseConfig;
```

- [ ] **Step 3: Add the shared config package to app dependencies and fix worker scripts**

`apps/worker/package.json` should contain:

```json
{
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc -p tsconfig.json",
    "start": "node dist/index.js",
    "test": "tsx --test src/**/*.test.ts src/**/*.integration.test.ts",
    "lint": "eslint src --ext .ts",
    "typecheck": "tsc --noEmit -p tsconfig.json"
  },
  "dependencies": {
    "@reviewer/core": "workspace:*",
    "bullmq": "^5.58.0",
    "ioredis": "^5.8.1"
  },
  "devDependencies": {
    "@reviewer/eslint-config": "workspace:*",
    "@types/node": "^24.5.2",
    "eslint": "^9.38.0",
    "tsx": "^4.20.5",
    "typescript": "^5.9.2"
  }
}
```

`apps/web/package.json` should contain:

```json
{
  "devDependencies": {
    "@reviewer/eslint-config": "workspace:*",
    "@tailwindcss/postcss": "^4",
    "@types/node": "^20",
    "@types/react": "^19",
    "@types/react-dom": "^19",
    "eslint": "^9",
    "eslint-config-next": "16.2.1",
    "tailwindcss": "^4",
    "typescript": "^5"
  }
}
```

- [ ] **Step 4: Run the engineering test to verify it passes**

Run: `node --test tests/basic-engineering.test.mjs`
Expected: PASS for all shared ESLint integration assertions.

- [ ] **Step 5: Commit app integration changes**

```bash
git add apps/web/eslint.config.mjs apps/web/package.json apps/worker/eslint.config.mjs apps/worker/package.json tests/basic-engineering.test.mjs pnpm-lock.yaml
git commit -m "feat: share eslint config across apps"
```

### Task 4: Verify Real Lint Behavior and Update Checklist

**Files:**

- Modify: `doc/p0-delivery-checklist.md`
- Test: `apps/web/eslint.config.mjs`
- Test: `apps/worker/eslint.config.mjs`

- [ ] **Step 1: Run real lint for both apps**

Run: `pnpm -r run lint`
Expected: both `apps/web` and `apps/worker` execute ESLint successfully with exit code 0.

- [ ] **Step 2: Run typecheck to confirm responsibility split stays intact**

Run: `pnpm -r run typecheck`
Expected: both apps complete TypeScript checks successfully with exit code 0.

- [ ] **Step 3: Update the delivery checklist**

Change this line in `doc/p0-delivery-checklist.md`:

```md
- [ ] 接入 `ESLint`、`TypeScript`、`Prettier`
```

To:

```md
- [x] 接入 `ESLint`、`TypeScript`、`Prettier`
```

- [ ] **Step 4: Run the engineering test one more time after the doc update**

Run: `node --test tests/basic-engineering.test.mjs`
Expected: PASS, proving the code/config state is still valid after the doc update.

- [ ] **Step 5: Commit verification and checklist update**

```bash
git add doc/p0-delivery-checklist.md
git commit -m "docs: mark lint foundation as complete"
```

## Self-Review

- Spec coverage: covered shared package creation, `web` / `worker` integration, worker real ESLint adoption, verification, and checklist update
- Placeholder scan: no `TODO` / `TBD` / vague “handle later” wording left in tasks
- Type consistency: package name, import paths, and script names are consistent as `@reviewer/eslint-config`, `base`, `next`, `lint`, and `typecheck`
