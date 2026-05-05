import type { ReviewGraphStateType } from "../state.js";

/**
 * collect_findings：把 perFinding 里 approved + exhausted 的全部合并到 finalFindings。
 *
 * - approved → 用当前 finding（critic 通过的版本）
 * - exhausted + 有 patchedFinding → 用 critic 的修正版兜底
 * - exhausted + 无 patchedFinding → 保留最后一次 regenerator 写入的 finding
 *
 * pending 状态理论上不会出现在这里（router 已经把它们都派去 regenerator 或 critic），
 * 即便出现也不入 finalFindings，避免泄漏未完成的 finding。
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
