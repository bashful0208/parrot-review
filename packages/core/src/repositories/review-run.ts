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

export interface CreateReviewRunInput {
  organizationId: string;
  repositoryId: string;
  pullRequestId: string;
  triggerType: string;
  triggerEventId: string | null;
  baseSha: string;
  headSha: string;
  queueJobId: string | null;
}

export async function createReviewRun(
  input: CreateReviewRunInput
): Promise<{ id: string }> {
  const logger = createLogger({ component: "queue" });
  try {
    // graph_thread_id 由 trg_review_runs_graph_thread (0008) BEFORE INSERT
    // trigger 自动同步为 id::text；这里不显式写入避免重复维护。
    const result = await getPool().query<{ id: string }>(
      `insert into public.review_runs
         (organization_id, repository_id, pull_request_id, run_number,
          trigger_type, trigger_event_id, review_mode, output_language,
          status, base_sha, head_sha, queue_job_id, rule_snapshot)
       values (
         $1, $2, $3,
         (select coalesce(max(run_number), 0) + 1
            from public.review_runs
           where pull_request_id = $3),
         $4, $5, 'standard', 'en-US',
         'queued', $6, $7, $8, '{}'
       )
       returning id`,
      [
        input.organizationId,
        input.repositoryId,
        input.pullRequestId,
        input.triggerType,
        input.triggerEventId,
        input.baseSha,
        input.headSha,
        input.queueJobId,
      ]
    );

    const row = result.rows[0]!;
    logger.info("Review run created", {
      review_run_id: row.id,
      pull_request_id: input.pullRequestId,
      trigger_type: input.triggerType,
    });

    return { id: row.id };
  } catch (error) {
    logger.error("Failed to create review run", error as Error, {
      operation: "create_review_run",
      pull_request_id: input.pullRequestId,
    });
    throw new AppError(
      ErrorCode.DependencyDatabaseConnection,
      "Failed to create review run"
    );
  }
}

export interface UpdateReviewRunInput {
  status?: string;
  startedAt?: Date;
  finishedAt?: Date;
  errorCode?: string | null;
  errorMessage?: string | null;
  findingsCount?: number;
  analyzedFilesCount?: number;
  summaryMd?: string | null;
}

export async function updateReviewRun(
  id: string,
  fields: UpdateReviewRunInput
): Promise<void> {
  if (Object.keys(fields).length === 0) return;

  const logger = createLogger({ component: "queue" });

  const setClauses: string[] = ["updated_at = now()"];
  const params: unknown[] = [];
  let idx = 1;

  if (fields.status !== undefined) {
    setClauses.push(`status = $${idx++}`);
    params.push(fields.status);
  }
  if (fields.startedAt !== undefined) {
    setClauses.push(`started_at = $${idx++}`);
    params.push(fields.startedAt);
  }
  if (fields.finishedAt !== undefined) {
    setClauses.push(`finished_at = $${idx++}`);
    params.push(fields.finishedAt);
  }
  if (fields.errorCode !== undefined) {
    setClauses.push(`error_code = $${idx++}`);
    params.push(fields.errorCode);
  }
  if (fields.errorMessage !== undefined) {
    setClauses.push(`error_message = $${idx++}`);
    params.push(fields.errorMessage);
  }
  if (fields.findingsCount !== undefined) {
    setClauses.push(`findings_count = $${idx++}`);
    params.push(fields.findingsCount);
  }
  if (fields.analyzedFilesCount !== undefined) {
    setClauses.push(`analyzed_files_count = $${idx++}`);
    params.push(fields.analyzedFilesCount);
  }
  if (fields.summaryMd !== undefined) {
    setClauses.push(`summary_md = $${idx++}`);
    params.push(fields.summaryMd);
  }

  params.push(id);

  try {
    await getPool().query(
      `update public.review_runs
          set ${setClauses.join(", ")}
        where id = $${idx}`,
      params
    );

    logger.info("Review run updated", {
      review_run_id: id,
      fields: Object.keys(fields),
    });
  } catch (error) {
    logger.error("Failed to update review run", error as Error, {
      operation: "update_review_run",
      review_run_id: id,
    });
    throw new AppError(
      ErrorCode.DependencyDatabaseConnection,
      "Failed to update review run"
    );
  }
}
