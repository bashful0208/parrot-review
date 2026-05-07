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
        `($${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++})`
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
        issue.suggestionMd
      );
    }

    const result = await getPool().query<{ id: string }>(
      `insert into public.review_issues
         (organization_id, repository_id, pull_request_id, review_run_id,
          fingerprint, issue_type, title, summary, severity, confidence_score,
          file_path, start_line, end_line, suggestion_md)
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
    }>(
      `select ri.id, ri.review_run_id, ri.fingerprint, ri.issue_type,
              ri.title, ri.summary, ri.severity, ri.confidence_score,
              ri.file_path, ri.start_line, ri.end_line, ri.suggestion_md,
              ri.status, ri.created_at
         from public.review_issues ri
        where ri.review_run_id = $1
          and ri.organization_id = $2
        order by
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
