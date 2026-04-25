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
