import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  scanErrorHandlingPatterns,
  formatScannedPatternsForPrompt,
} from "./error-handler-scanner.js";
import type { FileDiff } from "@reviewer/git";

function diff(patch: string, overrides: Partial<FileDiff> = {}): FileDiff {
  return {
    filePath: "a.ts",
    previousPath: null,
    changeType: "modified",
    additions: patch.split("\n").length,
    deletions: 0,
    isBinary: false,
    patch: `@@ -0,0 +1,${patch.split("\n").length} @@\n${patch
      .split("\n")
      .map((l) => `+${l}`)
      .join("\n")}`,
    ...overrides,
  };
}

describe("scanErrorHandlingPatterns", () => {
  it("detects empty catch block", () => {
    const results = scanErrorHandlingPatterns([
      diff("try {\n  doThing();\n} catch (e) { }"),
    ]);
    assert.ok(results.length >= 1);
    assert.equal(results.some((r) => r.pattern === "empty_catch"), true);
  });

  it("detects broad catch with Exception", () => {
    const results = scanErrorHandlingPatterns([
      diff("try {\n  doThing();\n} catch (Exception e) {\n  log(e);\n}"),
    ]);
    const bc = results.find((r) => r.pattern === "broad_catch");
    assert.ok(bc);
    assert.match(bc!.context, /Exception/);
  });

  it("detects catch (...)", () => {
    const results = scanErrorHandlingPatterns([
      diff("try {\n  doThing();\n} catch (...) {\n  log('oops');\n}"),
    ]);
    assert.ok(results.some((r) => r.pattern === "broad_catch"));
  });

  it("detects logger.warn inside catch block", () => {
    const results = scanErrorHandlingPatterns([
      diff("try {\n  risky();\n} catch (e) {\n  logger.warn('oops', e);\n}"),
    ]);
    const dl = results.find((r) => r.pattern === "downgraded_logging");
    assert.ok(dl);
    assert.match(dl!.context, /logger\.warn/);
  });

  it("detects console.log inside catch block", () => {
    const results = scanErrorHandlingPatterns([
      diff("try {\n  risky();\n} catch (e) {\n  console.log(e);\n}"),
    ]);
    assert.ok(results.some((r) => r.pattern === "downgraded_logging"));
  });

  it("detects non-actionable error message", () => {
    const results = scanErrorHandlingPatterns([
      diff('throw new Error("something went wrong")'),
    ]);
    assert.ok(
      results.some((r) => r.pattern === "non_actionable_message")
    );
  });

  it("does not flag catch with re-throw", () => {
    const results = scanErrorHandlingPatterns([
      diff(
        "try {\n  risky();\n} catch (e) {\n  logger.error('failed', e);\n  throw e;\n}"
      ),
    ]);
    const bc = results.filter((r) => r.pattern === "broad_catch");
    assert.equal(bc.length, 0);
  });

  it("does not flag logger.error inside catch", () => {
    const results = scanErrorHandlingPatterns([
      diff("try {\n  risky();\n} catch (e) {\n  logger.error('fail', e);\n}"),
    ]);
    assert.equal(
      results.some((r) => r.pattern === "downgraded_logging"),
      false
    );
  });

  it("returns empty array for diff with no error handling", () => {
    const results = scanErrorHandlingPatterns([
      diff("function add(a: number, b: number): number {\n  return a + b;\n}"),
      diff("const x = 1;\nconst y = 2;"),
    ]);
    assert.equal(results.length, 0);
  });

  it("skips binary files", () => {
    const results = scanErrorHandlingPatterns([
      {
        filePath: "img.png",
        previousPath: null,
        changeType: "modified",
        additions: 0,
        deletions: 0,
        isBinary: true,
        patch: null,
      },
    ]);
    assert.equal(results.length, 0);
  });
});

describe("formatScannedPatternsForPrompt", () => {
  it("returns empty string for empty patterns", () => {
    assert.equal(formatScannedPatternsForPrompt([]), "");
  });

  it("produces formatted XML block for non-empty patterns", () => {
    const formatted = formatScannedPatternsForPrompt([
      {
        filePath: "a.ts",
        startLine: 10,
        endLine: 12,
        pattern: "empty_catch",
        context: "catch (e) { }",
      },
      {
        filePath: "b.ts",
        startLine: 20,
        endLine: 22,
        pattern: "non_actionable_message",
        context: 'throw new Error("something went wrong")',
      },
    ]);
    assert.match(formatted, /<pre_scanned_error_patterns>/);
    assert.match(formatted, /\[empty_catch\] a\.ts:10-12/);
    assert.match(
      formatted,
      /\[non_actionable_message\] b\.ts:20-22/
    );
    assert.match(formatted, /catch \(e\) \{ \}/);
    assert.match(formatted, /something went wrong/);
  });
});
