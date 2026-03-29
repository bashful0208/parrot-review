import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
const coreDir = "/Users/bashful/work/code/reviewer/packages/core";
const distIndexPath = path.join(coreDir, "dist", "index.js");
test("core build produces a Node-importable dist entry", async () => {
    const fileContents = await readFile(distIndexPath, "utf8");
    assert.match(fileContents, /\.\/env\.js/);
    const module = await import(pathToFileURL(distIndexPath).href);
    assert.equal(typeof module.buildWorkerConfig, "function");
    assert.equal(typeof module.createPlaceholderWorker, "function");
});
