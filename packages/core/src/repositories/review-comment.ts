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

export interface InsertReviewCommentInput {
  organizationId: string;
  pullRequestId: string;
  reviewRunId: string;
  reviewIssueId: string;
  provider: string;
  bodyMd: string;
  filePath: string | null;
  lineNumber: number | null;
  isInline: boolean;
}

export async function insertReviewComment(
  input: InsertReviewCommentInput
): Promise<{ id: string }> {
  const logger = createLogger({ component: "queue" });
  try {
    const result = await getPool().query<{ id: string }>(
      `insert into public.review_comments
         (organization_id, pull_request_id, review_run_id, review_issue_id,
          provider, body_md, output_language, status, is_inline, file_path, line_number)
       values ($1, $2, $3, $4, $5, $6, 'en-US', 'draft', $7, $8, $9)
       returning id`,
      [
        input.organizationId,
        input.pullRequestId,
        input.reviewRunId,
        input.reviewIssueId,
        input.provider,
        input.bodyMd,
        input.isInline,
        input.filePath,
        input.lineNumber,
      ]
    );

    const row = result.rows[0]!;
    logger.info("Review comment inserted", {
      review_comment_id: row.id,
      review_run_id: input.reviewRunId,
      review_issue_id: input.reviewIssueId,
    });

    return { id: row.id };
  } catch (error) {
    logger.error("Failed to insert review comment", error as Error, {
      operation: "insert_review_comment",
      review_run_id: input.reviewRunId,
      review_issue_id: input.reviewIssueId,
    });
    throw new AppError(
      ErrorCode.DependencyDatabaseConnection,
      "Failed to insert review comment"
    );
  }
}

export async function markCommentPosted(
  id: string,
  externalCommentId: string,
  postedAt: Date
): Promise<void> {
  const logger = createLogger({ component: "queue" });
  try {
    await getPool().query(
      `update public.review_comments
          set status = 'posted',
              external_comment_id = $2,
              posted_at = $3,
              updated_at = now()
        where id = $1`,
      [id, externalCommentId, postedAt]
    );

    logger.info("Review comment marked as posted", {
      review_comment_id: id,
      external_comment_id: externalCommentId,
    });
  } catch (error) {
    logger.error("Failed to mark comment as posted", error as Error, {
      operation: "mark_comment_posted",
      review_comment_id: id,
    });
    throw new AppError(
      ErrorCode.DependencyDatabaseConnection,
      "Failed to mark comment as posted"
    );
  }
}
