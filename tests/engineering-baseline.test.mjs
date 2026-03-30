import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const testFileDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(testFileDir, "..");

async function readJson(relativePath) {
  return JSON.parse(await readFile(path.join(rootDir, relativePath), "utf8"));
}

async function readText(relativePath) {
  return readFile(path.join(rootDir, relativePath), "utf8");
}

test("root engineering baseline exposes shared config entrypoints", async () => {
  const packageJson = await readJson("package.json");

  assert.equal(packageJson.scripts.format, "prettier --write .");
  assert.equal(
    packageJson.scripts.check,
    "pnpm lint && pnpm typecheck && pnpm test"
  );
  assert.equal(packageJson.devDependencies.eslint, "^9.39.1");

  const tsconfigBase = JSON.parse(await readText("tsconfig.base.json"));
  assert.equal(tsconfigBase.compilerOptions.strict, true);

  const eslintConfig = await readText("eslint.config.mjs");
  assert.match(eslintConfig, /"\*\*\/\.worktrees\/\*\*"/);
  assert.match(eslintConfig, /"\*\*\/\.claude\/worktrees\/\*\*"/);

  await readText(".prettierrc.json");
  await readText(".prettierignore");
});

test("workspace tsconfig files inherit from the root baseline", async () => {
  const expectedExtends = new Map([
    ["apps/web/tsconfig.json", "../../tsconfig.base.json"],
    ["apps/worker/tsconfig.json", "../../tsconfig.base.json"],
    ["packages/ai/tsconfig.json", "../../tsconfig.base.json"],
    ["packages/core/tsconfig.json", "../../tsconfig.base.json"],
    ["packages/db-types/tsconfig.json", "../../tsconfig.base.json"],
    ["packages/git/tsconfig.json", "../../tsconfig.base.json"],
    ["packages/shared/tsconfig.json", "../../tsconfig.base.json"],
  ]);

  for (const [relativePath, expectedExtendsPath] of expectedExtends) {
    const tsconfig = await readJson(relativePath);
    assert.equal(tsconfig.extends, expectedExtendsPath, relativePath);
  }

  const workerDevTsconfig = await readJson("apps/worker/tsconfig.dev.json");
  assert.equal(workerDevTsconfig.extends, "./tsconfig.json");
});

test("workspace lint scripts use eslint while typecheck stays on tsc", async () => {
  const expectedPackages = [
    "apps/web/package.json",
    "apps/worker/package.json",
    "packages/ai/package.json",
    "packages/core/package.json",
    "packages/db-types/package.json",
    "packages/git/package.json",
    "packages/shared/package.json",
  ];

  for (const relativePath of expectedPackages) {
    const packageJson = await readJson(relativePath);
    assert.match(packageJson.scripts.lint, /eslint/);
    assert.match(packageJson.scripts.typecheck, /tsc --noEmit/);
  }

  const sharedPackageJson = await readJson("packages/shared/package.json");
  assert.equal(sharedPackageJson.devDependencies["@types/node"], "^24.5.2");
});

test("web eslint config reuses the workspace baseline", async () => {
  const webEslintConfig = await readText("apps/web/eslint.config.mjs");

  assert.match(webEslintConfig, /from "\.\.\/\.\.\/eslint\.config\.mjs"/);
  assert.match(webEslintConfig, /eslint-config-next\/core-web-vitals/);
});

test("shared package uses explicit NodeNext export extensions", async () => {
  const sharedIndex = await readText("packages/shared/src/index.ts");

  assert.match(sharedIndex, /from "\.\/review-queue\.js"/);
});
