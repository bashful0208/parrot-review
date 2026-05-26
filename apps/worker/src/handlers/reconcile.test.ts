import { test } from "node:test";
import assert from "node:assert/strict";

import { reconcileFindings } from "./reconcile.js";

const RUN_ID = "run-current";

function mkPrev(opts: { id: string; fingerprint: string; firstSeen?: string }) {
  return {
    id: opts.id,
    fingerprint: opts.fingerprint,
    firstSeenRunId: opts.firstSeen ?? "run-old",
    filePath: "src/foo.ts",
    title: "old title",
    severity: "high",
    issueType: "quality",
  };
}

test("reconcileFindings — 全新 finding 标记 new 且 firstSeen=currentRunId", () => {
  const result = reconcileFindings({
    findings: [{ fingerprint: "fp-A", anything: 1 }],
    previousOpenIssues: [],
    currentRunId: RUN_ID,
  });
  assert.equal(result.enriched.length, 1);
  assert.equal(result.enriched[0]!.relation, "new");
  assert.equal(result.enriched[0]!.firstSeenRunId, RUN_ID);
  assert.deepEqual(result.counts, { new: 1, persisted: 0, resolved: 0 });
  assert.deepEqual(result.resolvedIssueIds, []);
});

test("reconcileFindings — 命中历史 fingerprint 标记 persisted 并复用 firstSeen", () => {
  const result = reconcileFindings({
    findings: [{ fingerprint: "fp-A" }],
    previousOpenIssues: [mkPrev({ id: "issue-1", fingerprint: "fp-A", firstSeen: "run-old" })],
    currentRunId: RUN_ID,
  });
  assert.equal(result.enriched[0]!.relation, "persisted");
  assert.equal(result.enriched[0]!.firstSeenRunId, "run-old");
  assert.deepEqual(result.counts, { new: 0, persisted: 1, resolved: 0 });
  assert.deepEqual(result.resolvedIssueIds, []);
});

test("reconcileFindings — 上一次 open 本次未现 → resolved", () => {
  const result = reconcileFindings({
    findings: [],
    previousOpenIssues: [
      mkPrev({ id: "issue-1", fingerprint: "fp-A" }),
      mkPrev({ id: "issue-2", fingerprint: "fp-B" }),
    ],
    currentRunId: RUN_ID,
  });
  assert.deepEqual(result.resolvedIssueIds.sort(), ["issue-1", "issue-2"]);
  assert.deepEqual(result.counts, { new: 0, persisted: 0, resolved: 2 });
});

test("reconcileFindings — 三态混合（new / persisted / resolved）", () => {
  const result = reconcileFindings({
    findings: [
      { fingerprint: "fp-A" }, // persisted
      { fingerprint: "fp-NEW" }, // new
    ],
    previousOpenIssues: [
      mkPrev({ id: "issue-A", fingerprint: "fp-A", firstSeen: "run-old" }),
      mkPrev({ id: "issue-RESOLVED", fingerprint: "fp-GONE" }),
    ],
    currentRunId: RUN_ID,
  });
  assert.deepEqual(result.counts, { new: 1, persisted: 1, resolved: 1 });
  assert.deepEqual(result.resolvedIssueIds, ["issue-RESOLVED"]);
  const newOne = result.enriched.find((e) => e.relation === "new")!;
  assert.equal(newOne.firstSeenRunId, RUN_ID);
  const persistedOne = result.enriched.find((e) => e.relation === "persisted")!;
  assert.equal(persistedOne.firstSeenRunId, "run-old");
});

test("reconcileFindings — previousOpenIssues 为空时不输出 resolved", () => {
  const result = reconcileFindings({
    findings: [{ fingerprint: "fp-A" }, { fingerprint: "fp-B" }],
    previousOpenIssues: [],
    currentRunId: RUN_ID,
  });
  assert.deepEqual(result.counts, { new: 2, persisted: 0, resolved: 0 });
  assert.equal(result.resolvedIssueIds.length, 0);
});

test("reconcileFindings — 历史 firstSeenRunId 为 null 时回退到 currentRunId", () => {
  const result = reconcileFindings({
    findings: [{ fingerprint: "fp-A" }],
    previousOpenIssues: [
      {
        id: "issue-1",
        fingerprint: "fp-A",
        firstSeenRunId: null,
        filePath: null,
        title: "x",
        severity: "low",
        issueType: "quality",
      },
    ],
    currentRunId: RUN_ID,
  });
  assert.equal(result.enriched[0]!.firstSeenRunId, RUN_ID);
});
