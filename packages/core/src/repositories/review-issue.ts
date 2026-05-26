import { Pool } from "pg";

import { AppError, ErrorCode } from "../errors.js";
import { createLogger } from "../logging.js";

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

export interface InsertReviewIssueInput {
  organizationId: string;
  repositoryId: string;
  pullRequestId: string;
  reviewRunId: string;
  fingerprint: string;
  issueType: string;
  title: string;
  summary: string;
  severity: string;
  confidenceScore: number;
  filePath: string | null;
  startLine: number | null;
  endLine: number | null;
  suggestionMd: string | null;
  /** 历史 run id；增量审查命中已有 fingerprint 时复用，否则 = reviewRunId。 */
  firstSeenRunId?: string;
  /** 本次发现该问题的 run id；首次插入即 reviewRunId。 */
  lastSeenRunId?: string;
}

export async function insertReviewIssues(
  issues: InsertReviewIssueInput[]
): Promise<{ id: string }[]> {
  const logger = createLogger({ component: "queue" });

  if (issues.length === 0) {
    return [];
  }

  try {
    const valuePlaceholders: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    for (const issue of issues) {
      valuePlaceholders.push(
        `($${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++})`
      );
      params.push(
        issue.organizationId,
        issue.repositoryId,
        issue.pullRequestId,
        issue.reviewRunId,
        issue.fingerprint,
        issue.issueType,
        issue.title,
        issue.summary,
        issue.severity,
        issue.confidenceScore,
        issue.filePath,
        issue.startLine,
        issue.endLine,
        issue.suggestionMd,
        issue.firstSeenRunId ?? issue.reviewRunId,
        issue.lastSeenRunId ?? issue.reviewRunId
      );
    }

    const result = await getPool().query<{ id: string }>(
      `insert into public.review_issues
         (organization_id, repository_id, pull_request_id, review_run_id,
          fingerprint, issue_type, title, summary, severity, confidence_score,
          file_path, start_line, end_line, suggestion_md,
          first_seen_run_id, last_seen_run_id)
       values ${valuePlaceholders.join(", ")}
       on conflict (review_run_id, fingerprint) do nothing
       returning id`,
      params
    );

    logger.info("Review issues inserted", {
      review_run_id: issues[0]?.reviewRunId,
      requested: issues.length,
      inserted: result.rows.length,
    });

    return result.rows;
  } catch (error) {
    logger.error("Failed to insert review issues", error as Error, {
      operation: "insert_review_issues",
      review_run_id: issues[0]?.reviewRunId,
    });
    throw new AppError(
      ErrorCode.DependencyDatabaseConnection,
      "Failed to insert review issues"
    );
  }
}

export interface ReviewIssueRow {
  id: string;
  reviewRunId: string;
  fingerprint: string;
  issueType: string;
  title: string;
  summary: string;
  severity: string;
  confidenceScore: number;
  filePath: string | null;
  startLine: number | null;
  endLine: number | null;
  suggestionMd: string | null;
  status: string;
  createdAt: Date;
  firstSeenRunId: string | null;
  resolvedInRunId: string | null;
}

export async function listReviewIssuesByRun(
  reviewRunId: string,
  organizationId: string
): Promise<ReviewIssueRow[]> {
  const logger = createLogger({ component: "queue" });
  try {
    const result = await getPool().query<{
      id: string;
      review_run_id: string;
      fingerprint: string;
      issue_type: string;
      title: string;
      summary: string;
      severity: string;
      confidence_score: string;
      file_path: string | null;
      start_line: string | null;
      end_line: string | null;
      suggestion_md: string | null;
      status: string;
      created_at: Date;
      first_seen_run_id: string | null;
      resolved_in_run_id: string | null;
    }>(
      `select ri.id, ri.review_run_id, ri.fingerprint, ri.issue_type,
              ri.title, ri.summary, ri.severity, ri.confidence_score,
              ri.file_path, ri.start_line, ri.end_line, ri.suggestion_md,
              ri.status, ri.created_at,
              ri.first_seen_run_id, ri.resolved_in_run_id
         from public.review_issues ri
        where (ri.review_run_id = $1 or ri.resolved_in_run_id = $1)
          and ri.organization_id = $2
        order by
          case ri.status when 'resolved' then 1 else 0 end,
          case ri.severity
            when 'critical' then 1
            when 'high' then 2
            when 'medium' then 3
            when 'low' then 4
            else 5
          end,
          ri.confidence_score desc`,
      [reviewRunId, organizationId]
    );

    return result.rows.map((row) => ({
      id: row.id,
      reviewRunId: row.review_run_id,
      fingerprint: row.fingerprint,
      issueType: row.issue_type,
      title: row.title,
      summary: row.summary,
      severity: row.severity,
      confidenceScore: Number(row.confidence_score),
      filePath: row.file_path,
      startLine: row.start_line ? Number(row.start_line) : null,
      endLine: row.end_line ? Number(row.end_line) : null,
      suggestionMd: row.suggestion_md,
      status: row.status,
      createdAt: row.created_at,
      firstSeenRunId: row.first_seen_run_id,
      resolvedInRunId: row.resolved_in_run_id,
    }));
  } catch (error) {
    logger.error("Failed to list review issues by run", error as Error, {
      operation: "list_review_issues_by_run",
      review_run_id: reviewRunId,
    });
    throw new AppError(
      ErrorCode.DependencyDatabaseConnection,
      "Failed to list review issues by run"
    );
  }
}

export interface OpenIssueForReconcile {
  id: string;
  fingerprint: string;
  firstSeenRunId: string | null;
  filePath: string | null;
  title: string;
  severity: string;
  issueType: string;
}

/**
 * 取该 PR 上"上一次 succeeded run"所产出的、当前仍处于 open 状态的 issue。
 * 用于增量审查的 reconcile：fingerprint 匹配本次新发现以判定 new/persisted/resolved。
 */
export async function listOpenIssuesByPullRequest(
  pullRequestId: string,
  previousRunId: string
): Promise<OpenIssueForReconcile[]> {
  const logger = createLogger({ component: "queue" });
  try {
    const result = await getPool().query<{
      id: string;
      fingerprint: string;
      first_seen_run_id: string | null;
      file_path: string | null;
      title: string;
      severity: string;
      issue_type: string;
    }>(
      `select id, fingerprint, first_seen_run_id, file_path, title, severity, issue_type
         from public.review_issues
        where pull_request_id = $1
          and review_run_id = $2
          and status = 'open'`,
      [pullRequestId, previousRunId]
    );
    return result.rows.map((row) => ({
      id: row.id,
      fingerprint: row.fingerprint,
      firstSeenRunId: row.first_seen_run_id,
      filePath: row.file_path,
      title: row.title,
      severity: row.severity,
      issueType: row.issue_type,
    }));
  } catch (error) {
    logger.error("Failed to list open issues by pull request", error as Error, {
      operation: "list_open_issues_by_pr",
      pull_request_id: pullRequestId,
      previous_run_id: previousRunId,
    });
    throw new AppError(
      ErrorCode.DependencyDatabaseConnection,
      "Failed to list open issues by pull request"
    );
  }
}

/**
 * 把上一次发现、本次未再现的 issue 标记为 resolved。
 */
export async function markIssuesResolved(
  issueIds: string[],
  resolvedInRunId: string
): Promise<void> {
  if (issueIds.length === 0) return;
  const logger = createLogger({ component: "queue" });
  try {
    await getPool().query(
      `update public.review_issues
          set status = 'resolved',
              resolved_in_run_id = $2,
              updated_at = now()
        where id = any($1::uuid[])
          and status = 'open'`,
      [issueIds, resolvedInRunId]
    );
    logger.info("Review issues marked resolved", {
      resolved_in_run_id: resolvedInRunId,
      count: issueIds.length,
    });
  } catch (error) {
    logger.error("Failed to mark issues resolved", error as Error, {
      operation: "mark_issues_resolved",
      resolved_in_run_id: resolvedInRunId,
    });
    throw new AppError(
      ErrorCode.DependencyDatabaseConnection,
      "Failed to mark issues resolved"
    );
  }
}

export async function getOpenFindingsCount(
  organizationId: string
): Promise<number> {
  const logger = createLogger({ component: "queue" });
  try {
    const result = await getPool().query<{ count: string }>(
      `select count(*)::bigint as count
         from public.review_issues
        where organization_id = $1
          and status not in ('resolved', 'ignored')`,
      [organizationId]
    );
    return Number(result.rows[0]?.count ?? 0);
  } catch (error) {
    logger.error("Failed to count open findings", error as Error, {
      operation: "get_open_findings_count",
      organization_id: organizationId,
    });
    throw new AppError(
      ErrorCode.DependencyDatabaseConnection,
      "Failed to count open findings"
    );
  }
}
