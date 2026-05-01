import { Annotation } from "@langchain/langgraph";

import type { CritiqueResult, ReviewFinding, ReviewSummary } from "../types.js";

/** review_run 期内单条 finding 的反思生命周期。 */
export interface PerFindingState {
  finding: ReviewFinding;
  attempts: number;
  lastCritique: CritiqueResult | null;
  status: "pending" | "approved" | "exhausted";
}

/** ReviewContext 减去 diffs / guidelines / projectContext（这些通过 ctx-cache 取）。 */
export interface ReviewContextRef {
  fullName: string;
  prNumber: number;
  headSha: string;
  organizationId: string;
  repositoryId: string;
  pullRequestId: string;
  reviewRunId: string;
  providerConfigId: string;
}

/** 各 channel 的合并策略；导出便于直接单测，不依赖 LangGraph 内部 spec 结构。 */
export const overwriteReducer = <T>(_l: T, r: T): T => r;
export const appendArrayReducer = <T>(l: T[], r: T[]): T[] => [...l, ...r];
export const mergeMapReducer = <V>(
  l: Record<string, V>,
  r: Record<string, V>
): Record<string, V> => ({ ...l, ...r });

export const ReviewGraphState = Annotation.Root({
  reviewRunId: Annotation<string>({
    reducer: overwriteReducer,
    default: () => "",
  }),
  context: Annotation<ReviewContextRef>({
    reducer: overwriteReducer,
    default: () => ({}) as ReviewContextRef,
  }),
  draftFindings: Annotation<ReviewFinding[]>({
    reducer: appendArrayReducer,
    default: () => [],
  }),
  reviewerErrors: Annotation<Array<{ role: string; error: string }>>({
    reducer: appendArrayReducer,
    default: () => [],
  }),
  aggregatedFindings: Annotation<ReviewFinding[]>({
    reducer: overwriteReducer,
    default: () => [],
  }),
  perFinding: Annotation<Record<string, PerFindingState>>({
    reducer: mergeMapReducer,
    default: () => ({}),
  }),
  finalFindings: Annotation<ReviewFinding[]>({
    reducer: overwriteReducer,
    default: () => [],
  }),
  summary: Annotation<ReviewSummary | null>({
    reducer: overwriteReducer,
    default: () => null,
  }),
});

export type ReviewGraphStateType = typeof ReviewGraphState.State;
