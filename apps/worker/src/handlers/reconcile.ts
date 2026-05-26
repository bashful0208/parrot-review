import type { OpenIssueForReconcile } from "@reviewer/core";

export interface ReconcileInput<F> {
  /** 本次审查的 findings + 已计算 fingerprint */
  findings: Array<F & { fingerprint: string }>;
  /** 上一次仍 open 的 issue（按 fingerprint 做匹配主键） */
  previousOpenIssues: OpenIssueForReconcile[];
  /** 当前 review_run id；用作未命中 finding 的 first_seen_run_id 默认值 */
  currentRunId: string;
}

export interface ReconcileResult<F> {
  /** 每条 finding 关联的 first_seen_run_id（命中历史则复用，否则 = currentRunId） */
  enriched: Array<F & {
    fingerprint: string;
    firstSeenRunId: string;
    relation: "new" | "persisted";
  }>;
  /** 上一次 open、本次未再现的 issue id（worker 用来 markIssuesResolved） */
  resolvedIssueIds: string[];
  counts: { new: number; persisted: number; resolved: number };
}

/**
 * 纯函数：根据 fingerprint 比对，决定每条 finding 是 new / persisted；
 * 上一次 open 但本次未再现的 → resolved。无 DB 访问，便于单测。
 */
export function reconcileFindings<F>(
  input: ReconcileInput<F>
): ReconcileResult<F> {
  const previousByFingerprint = new Map(
    input.previousOpenIssues.map((p) => [p.fingerprint, p])
  );
  const matchedPreviousIds = new Set<string>();

  let newCount = 0;
  let persistedCount = 0;
  const enriched = input.findings.map((f) => {
    const previous = previousByFingerprint.get(f.fingerprint);
    if (previous) {
      matchedPreviousIds.add(previous.id);
      persistedCount += 1;
      return {
        ...f,
        firstSeenRunId: previous.firstSeenRunId ?? input.currentRunId,
        relation: "persisted" as const,
      };
    }
    newCount += 1;
    return {
      ...f,
      firstSeenRunId: input.currentRunId,
      relation: "new" as const,
    };
  });

  const resolvedIssueIds = input.previousOpenIssues
    .filter((p) => !matchedPreviousIds.has(p.id))
    .map((p) => p.id);

  return {
    enriched,
    resolvedIssueIds,
    counts: {
      new: newCount,
      persisted: persistedCount,
      resolved: resolvedIssueIds.length,
    },
  };
}
