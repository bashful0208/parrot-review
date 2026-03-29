import test from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const rootDir = "/Users/bashful/work/code/reviewer";
const bannedPatterns = [
  /WORKER_AUTOSTART/,
  /dry-run/i,
  /bootstrap ready/i,
];
const scanRoots = [
  "apps/worker/src",
  "packages/shared/src",
  "scripts",
];
const scanFiles = ["doc/startup-and-deployment.md"];

async function collectFiles(relativeDir) {
  const entries = await readdir(path.join(rootDir, relativeDir), { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const relativePath = path.join(relativeDir, entry.name);

    if (entry.isDirectory()) {
      files.push(...await collectFiles(relativePath));
      continue;
    }

    files.push(relativePath);
  }

  return files;
}

test("worker runtime has no dry-run or autostart fallback hooks", async () => {
  const files = [
    ...scanFiles,
    ...(await Promise.all(scanRoots.map((relativeDir) => collectFiles(relativeDir)))).flat(),
  ];

  for (const relativePath of files) {
    const contents = await readFile(path.join(rootDir, relativePath), "utf8");

    for (const pattern of bannedPatterns) {
      assert.doesNotMatch(
        contents,
        pattern,
        `${relativePath} still contains banned fallback marker ${pattern}`,
      );
    }
  }
});
