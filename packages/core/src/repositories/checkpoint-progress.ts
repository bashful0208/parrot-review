import { Pool } from "pg";

import { createLogger } from "../logging.js";
import { AppError, ErrorCode } from "../errors.js";

let pool: Pool | null = null;

function getPool(): Pool {
  if (!pool) {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      throw new AppError(
        ErrorCode.DependencyDatabaseConnection,
        "DATABASE_URL is required"
      );
    }
    pool = new Pool({ connectionString: databaseUrl });
  }
  return pool;
}

type GraphPhase =
  | "idle"
  | "reviewing"
  | "aggregating"
  | "reflecting"
  | "summarizing"
  | "complete";

export interface GraphNodeState {
  id: string;
  label: string;
  status: "pending" | "running" | "completed";
  type: "reviewer" | "aggregator" | "critic" | "collect" | "summarizer";
}

export interface GraphMetrics {
  draftFindingsCount: number;
  aggregatedFindingsCount: number;
  perFindingTotal: number;
  perFindingApproved: number;
  perFindingExhausted: number;
  finalFindingsCount: number;
  hasSummary: boolean;
}

export interface GraphProgress {
  graphThreadId: string;
  phase: GraphPhase;
  completedNodes: string[];
  channelVersions: Record<string, string>;
  metrics: GraphMetrics;
  reviewerErrors: number;
  criticErrors: number;
  summaryError: string | null;
  updatedAt: string | null;
  nodes: GraphNodeState[];
  /** null means no issues, otherwise a diagnostic message */
  diagnostic: string | null;
}

const GRAPH_NODES: GraphNodeState[] = [
  { id: "quality_reviewer", label: "Quality Reviewer", status: "pending", type: "reviewer" },
  { id: "security_reviewer", label: "Security Reviewer", status: "pending", type: "reviewer" },
  { id: "error_handler_reviewer", label: "Error Handler Reviewer", status: "pending", type: "reviewer" },
  { id: "aggregator", label: "Aggregator", status: "pending", type: "aggregator" },
  { id: "critic", label: "Critic", status: "pending", type: "critic" },
  { id: "collect_findings", label: "Collect Findings", status: "pending", type: "collect" },
  { id: "summarizer", label: "Summarizer", status: "pending", type: "summarizer" },
];

function inferPhase(versions: Record<string, string>): GraphPhase {
  const has = (ch: string) => versions[ch] !== undefined;
  if (has("summary")) return "complete";
  if (has("finalFindings")) return "summarizing";
  if (has("perFinding") && has("aggregatedFindings")) return "reflecting";
  if (has("aggregatedFindings")) return "aggregating";
  if (has("draftFindings")) return "reviewing";
  return "idle";
}

function inferCompletedNodes(versions: Record<string, string>): string[] {
  const nodes: string[] = [];
  if (versions["draftFindings"] !== undefined) {
    nodes.push("quality_reviewer", "security_reviewer", "error_handler_reviewer");
  }
  if (versions["aggregatedFindings"] !== undefined) nodes.push("aggregator");
  if (versions["perFinding"] !== undefined) nodes.push("critic");
  if (versions["finalFindings"] !== undefined) nodes.push("collect_findings");
  if (versions["summary"] !== undefined) nodes.push("summarizer");
  return nodes;
}

function decodeBlob(raw: Buffer | null, type: string): unknown {
  if (raw === null || raw === undefined) return null;
  if (type === "json") {
    try {
      return JSON.parse(raw.toString("utf-8"));
    } catch {
      return null;
    }
  }
  try {
    return JSON.parse(raw.toString("utf-8"));
  } catch {
    return `[binary: ${raw.length} bytes]`;
  }
}

function len(v: unknown): number {
  if (Array.isArray(v)) return v.length;
  if (v && typeof v === "object" && !Array.isArray(v)) return Object.keys(v as object).length;
  return 0;
}

function extractMetrics(channels: Record<string, unknown>): GraphMetrics {
  const draftFindings = channels["draftFindings"];
  const aggregatedFindings = channels["aggregatedFindings"];
  const perFinding = channels["perFinding"] as Record<string, { status: string }> | undefined;
  const finalFindings = channels["finalFindings"];

  let perFindingApproved = 0;
  let perFindingExhausted = 0;
  if (perFinding) {
    for (const v of Object.values(perFinding)) {
      if (v.status === "approved") perFindingApproved++;
      else if (v.status === "exhausted") perFindingExhausted++;
    }
  }

  const summary = channels["summary"];

  return {
    draftFindingsCount: len(draftFindings),
    aggregatedFindingsCount: len(aggregatedFindings),
    perFindingTotal: len(perFinding),
    perFindingApproved,
    perFindingExhausted,
    finalFindingsCount: len(finalFindings),
    hasSummary: summary !== undefined && summary !== null,
  };
}

/**
 * 读取 LangGraph PostgresSaver 的 checkpoint 进度。
 * 通过 graph_thread_id（≈ review_runs.id）查找最新的 checkpoint 及关联 blobs。
 */
export async function getGraphProgress(
  graphThreadId: string
): Promise<GraphProgress | null> {
  const logger = createLogger({ component: "queue" });

  try {
    const pg = getPool();

    // 0. 先探测 checkpoint 表是否存在、是否有数据
    const existsResult = await pg.query<{ count: string }>(
      `select count(*)::bigint as count from public.checkpoints`
    ).catch(() => null);

    if (!existsResult) return null; // 表不存在

    const totalCheckpoints = Number(existsResult.rows[0]?.count ?? 0);
    if (totalCheckpoints === 0) return null; // 表存在但完全空（worker 没运行过）

    // 1. 先查看表中实际存在哪些 checkpoint_ns
    const nsResult = await pg.query<{ checkpoint_ns: string; cnt: string }>(
      `select checkpoint_ns, count(*)::bigint as cnt
       from public.checkpoints
       group by checkpoint_ns
       order by cnt desc`
    );

    const availableNs = nsResult.rows.map((r) => r.checkpoint_ns);
    const nsSummary = nsResult.rows.map((r) => `${r.checkpoint_ns || '(empty)'}:${r.cnt}`).join(", ");
    logger.info("Available checkpoint namespaces", {
      namespaces: availableNs,
      summary: nsSummary,
      graph_thread_id: graphThreadId,
    });

    // 按优先级尝试：review_v1 > "" > 任意
    const tryNs = availableNs.includes("review_v1")
      ? "review_v1"
      : availableNs.includes("")
        ? ""
        : availableNs.length > 0
          ? availableNs[0]!
          : "review_v1";

    // 2. 用正确的 namespace 查 checkpoint
    const cpResult = await pg.query<{
      checkpoint: Record<string, unknown>;
    }>(
      `select checkpoint, checkpoint_ns
       from public.checkpoints
       where thread_id = $1
         and checkpoint_ns = $2
       order by (checkpoint->>'ts') desc
       limit 1`,
      [graphThreadId, tryNs]
    );

    // 如果首选 ns 没找到，尝试其他 ns
    let matchedNs = tryNs;
    if (cpResult.rows.length === 0 && availableNs.length > 0) {
      for (const ns of availableNs) {
        if (ns === tryNs) continue;
        const altResult = await pg.query<{
          checkpoint: Record<string, unknown>;
        }>(
          `select checkpoint, checkpoint_ns
           from public.checkpoints
           where thread_id = $1
             and checkpoint_ns = $2
           order by (checkpoint->>'ts') desc
           limit 1`,
          [graphThreadId, ns]
        );
        if (altResult.rows.length > 0) {
          cpResult.rows = altResult.rows;
          matchedNs = ns;
          break;
        }
      }
    }

    if (cpResult.rows.length === 0) {
      logger.info("No checkpoint for this thread_id", {
        graph_thread_id: graphThreadId,
        available_namespaces: availableNs,
        ns_summary: nsSummary,
      });
      return null;
    }

    const cp = cpResult.rows[0]!.checkpoint;
    const channelVersions: Record<string, string> =
      (cp as Record<string, unknown>)?.channel_versions as Record<string, string> ?? {};
    const inlineValues: Record<string, unknown> =
      (cp as Record<string, unknown>)?.channel_values as Record<string, unknown> ?? {};
    const ts = (cp as Record<string, unknown>)?.ts as string | undefined;

    // 2. 读取 blobs（仅对有 version 且不在 inline 中的 channel）
    const decodedChannels: Record<string, unknown> = { ...inlineValues };

    for (const [ch, ver] of Object.entries(channelVersions)) {
      if (decodedChannels[ch] !== undefined) continue;

      try {
        const blobResult = await pg.query<{ type: string; blob: Buffer | null }>(
          `select type, blob
           from public.checkpoint_blobs
           where thread_id = $1
             and checkpoint_ns = $2
             and channel = $3
             and version = $4
           limit 1`,
          [graphThreadId, matchedNs, ch, ver]
        );
        if (blobResult.rows.length > 0) {
          decodedChannels[ch] = decodeBlob(blobResult.rows[0]!.blob, blobResult.rows[0]!.type);
        }
      } catch {
        // blob 查询失败不影响其他 channel
      }
    }

    // 3. 计算进度
    const phase = inferPhase(channelVersions);
    const completedNodes = inferCompletedNodes(channelVersions);
    const metrics = extractMetrics(decodedChannels);

    const reviewerErrorsArr = decodedChannels["reviewerErrors"];
    const criticErrorsArr = decodedChannels["criticErrors"];

    // 4. 节点状态
    const nodes: GraphNodeState[] = GRAPH_NODES.map((n) => ({
      ...n,
      status: (completedNodes.includes(n.id) ? "completed" : "pending") as GraphNodeState["status"],
    }));

    // 如果 phase 在某个阶段但对应节点还没完成，标记为 running
    const runningNode = (() => {
      switch (phase) {
        case "reviewing": return "quality_reviewer";
        case "aggregating": return "aggregator";
        case "reflecting": return "critic";
        case "summarizing": return "summarizer";
        default: return null;
      }
    })();
    if (runningNode) {
      const idx = nodes.findIndex((n) => n.id === runningNode);
      if (idx >= 0 && nodes[idx]!.status === "pending") {
        nodes[idx]!.status = "running";
      }
    }

    return {
      graphThreadId,
      phase,
      completedNodes,
      channelVersions,
      metrics,
      reviewerErrors: len(reviewerErrorsArr),
      criticErrors: len(criticErrorsArr),
      summaryError: typeof decodedChannels["summaryError"] === "string"
        ? (decodedChannels["summaryError"] as string)
        : null,
      updatedAt: ts ?? null,
      nodes,
      diagnostic: null,
    };
  } catch (error) {
    // 表不存在等情况优雅降级，返回 null（图还没运行过）
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.includes("relation") && msg.includes("does not exist")) {
      logger.info("Checkpoint tables not found — review graph has never run", {
        operation: "get_graph_progress",
        graph_thread_id: graphThreadId,
      });
      return null;
    }
    logger.error("Failed to read graph progress", error as Error, {
      operation: "get_graph_progress",
      graph_thread_id: graphThreadId,
    });
    throw new AppError(
      ErrorCode.DependencyDatabaseConnection,
      "Failed to read graph progress"
    );
  }
}
