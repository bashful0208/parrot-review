import type { ReviewGraphStateType } from "../state.js";

/**
 * Aggregate approved and exhausted per-finding entries into the final findings list.
 *
 * Includes only entries whose `status` is `"approved"` or `"exhausted"`. For each included entry:
 * - If `status` is `"exhausted"` and `lastCritique.patchedFinding` exists, use that patched finding.
 * - Otherwise use the entry's current `finding`.
 *
 * Entries with `pending` status are excluded.
 *
 * @param state - The review graph state containing `perFinding` entries
 * @returns A partial state object with `finalFindings` set to the aggregated findings array
 */
export async function collectFindings(
  state: ReviewGraphStateType
): Promise<Partial<ReviewGraphStateType>> {
  const final = Object.values(state.perFinding)
    .filter((ps) => ps.status === "approved" || ps.status === "exhausted")
    .map((ps) =>
      ps.status === "exhausted" && ps.lastCritique?.patchedFinding
        ? ps.lastCritique.patchedFinding
        : ps.finding
    );
  return { finalFindings: final };
}
