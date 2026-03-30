import { execFileSync } from "node:child_process";
import { access, mkdir, rename, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const helpersDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(helpersDir, "../..");
const packagesDir = path.join(repoRoot, "packages");
const corePackageDir = path.join(packagesDir, "core");
const coreDistDir = path.join(corePackageDir, "dist");
const coreDistLockDir = path.join(corePackageDir, ".dist-test-lock");
const LOCK_RETRY_MS = 50;
const LOCK_TIMEOUT_MS = 120000;

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

async function sleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export async function withCoreDistLock(callback) {
  const deadline = Date.now() + LOCK_TIMEOUT_MS;

  while (true) {
    try {
      await mkdir(coreDistLockDir);
      break;
    } catch (error) {
      if (error?.code !== "EEXIST") {
        throw error;
      }

      if (Date.now() >= deadline) {
        throw new Error(
          `Timed out waiting for core dist test lock: ${coreDistLockDir}`
        );
      }

      await sleep(LOCK_RETRY_MS);
    }
  }

  try {
    return await callback();
  } finally {
    await rm(coreDistLockDir, { recursive: true, force: true });
  }
}

export async function restoreRenamedDir(hiddenDir) {
  if (await pathExists(hiddenDir)) {
    const resolvedCoreDistDir = path.resolve(coreDistDir);
    const expectedDistDir = path.join(corePackageDir, "dist");
    const resolvedHiddenDir = path.resolve(hiddenDir);
    const hiddenDirParent = path.dirname(resolvedHiddenDir);
    const hiddenDirName = path.basename(resolvedHiddenDir);
    const isHiddenCoreDistDir =
      hiddenDirParent === corePackageDir &&
      hiddenDirName.startsWith(".dist") &&
      hiddenDirName !== ".dist";

    if (
      resolvedCoreDistDir !== expectedDistDir ||
      path.dirname(resolvedCoreDistDir) !== corePackageDir ||
      path.relative(packagesDir, resolvedCoreDistDir).startsWith("..")
    ) {
      throw new Error(
        `Refusing to remove unexpected dist path: ${resolvedCoreDistDir}`
      );
    }

    if (!isHiddenCoreDistDir) {
      throw new Error(
        `Refusing to restore unexpected hidden dist path: ${resolvedHiddenDir}`
      );
    }

    if (await pathExists(coreDistDir)) {
      await rm(coreDistDir, { recursive: true, force: true });
    }

    await rename(hiddenDir, coreDistDir);
  }
}

export async function withMissingCoreDist(hiddenDir, callback) {
  return withCoreDistLock(async () => {
    await ensureCoreDistExists();
    await rename(coreDistDir, hiddenDir);

    try {
      return await callback();
    } finally {
      await restoreRenamedDir(hiddenDir);
    }
  });
}

export { repoRoot, coreDistDir, coreDistLockDir };
