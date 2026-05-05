import { createHash } from "node:crypto";

import type { ReviewFinding } from "../../types.js";
import type { PerFindingState, ReviewGraphStateType } from "../state.js";

/**
 * Produces a deterministic identifier for a review finding scoped to a repository.
 *
 * @param repositoryId - The repository identifier used as the namespace for the key
 * @param f - The finding whose file path, start line, and English title are used to derive the key
 * @returns A hex-encoded SHA-256 hash of `${repositoryId}:${f.filePath}:${f.startLine}:${f.title_en}`
 */
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
 * Deduplicates and sorts draft findings and initializes per-finding state entries.
 *
 * Processes `state.draftFindings` by removing duplicates (keyed by the SHA-256 of
 * `repositoryId:filePath:startLine:title_en`), sorting remaining findings by
 * severity (critical → low) then by `filePath` lexicographic order, and building
 * a `perFinding` map with each entry's `PerFindingState` initialized.
 *
 * @param state - Graph state containing `context.repositoryId` and `draftFindings`
 * @returns A partial graph state with:
 *  - `aggregatedFindings`: the sorted, deduplicated array of findings
 *  - `perFinding`: a Record mapping each finding key to its initialized `PerFindingState` (`attempts: 0`, `lastCritique: null`, `status: "pending"`)
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
