import { createHash } from "node:crypto";

import type { ReviewFinding } from "../../types.js";
import type { PerFindingState, ReviewGraphStateType } from "../state.js";

export function findingKey(repositoryId: string, f: ReviewFinding): string {
  return createHash("sha256")
    .update(`${repositoryId}:${f.filePath}:${f.startLine}:${f.title_en}`)
    .digest("hex");
}

const SEVERITY_RANK: Record<ReviewFinding["severity"], number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

/**
 * 把 quality + security reviewer 产出的 draftFindings 去重 / 排序，
 * 并初始化每条 finding 的 PerFindingState。
 *
 * - 去重 key = sha256(repositoryId:filePath:startLine:title_en)
 *   与 review_issues.fingerprint 算法对齐，避免 graph 内 key 与 DB 不一致
 * - 排序：severity 高 → 低，相同 severity 按 filePath 字典序
 */
export async function aggregator(
  state: ReviewGraphStateType
): Promise<Partial<ReviewGraphStateType>> {
  const repositoryId = state.context.repositoryId;
  const seen = new Map<string, ReviewFinding>();

  for (const f of state.draftFindings) {
    const key = findingKey(repositoryId, f);
    if (!seen.has(key)) seen.set(key, f);
  }

  const sorted = [...seen.values()].sort((a, b) => {
    const s = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
    if (s !== 0) return s;
    return a.filePath.localeCompare(b.filePath);
  });

  const perFinding: Record<string, PerFindingState> = {};
  for (const f of sorted) {
    perFinding[findingKey(repositoryId, f)] = {
      finding: f,
      attempts: 0,
      lastCritique: null,
      status: "pending",
    };
  }

  return { aggregatedFindings: sorted, perFinding };
}
