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
  outputLanguage: string;
}

export async function createReviewRun(
  input: CreateReviewRunInput
): Promise<{ id: string; runNumber: number }> {
  const logger = createLogger({ component: "queue" });
  try {
    // graph_thread_id 由 trg_review_runs_graph_thread (0008) BEFORE INSERT
    // trigger 自动同步为 id::text；这里不显式写入避免重复维护。
    const result = await getPool().query<{ id: string; run_number: number }>(
      `insert into public.review_runs
         (organization_id, repository_id, pull_request_id, run_number,
          trigger_type, trigger_event_id, review_mode, output_language,
          status, base_sha, head_sha, queue_job_id, rule_snapshot)
       values (
         $1, $2, $3,
         (select coalesce(max(run_number), 0) + 1
            from public.review_runs
           where pull_request_id = $3),
         $4, $5, 'standard', $6::public.output_language,
         'queued', $7, $8, $9, '{}'
       )
       returning id, run_number`,
      [
        input.organizationId,
        input.repositoryId,
        input.pullRequestId,
        input.triggerType,
        input.triggerEventId,
        input.outputLanguage,
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

    return { id: row.id, runNumber: row.run_number };
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

export interface ReviewRunListRow {
  id: string;
  runNumber: number;
  triggerType: string;
  status: string;
  reviewMode: string;
  outputLanguage: string;
  summaryMd: string | null;
  findingsCount: number;
  analyzedFilesCount: number;
  securityFindingsCount: number;
  startedAt: Date | null;
  finishedAt: Date | null;
  errorCode: string | null;
  errorMessage: string | null;
  baseSha: string;
  headSha: string;
  aiModelName: string | null;
  createdAt: Date;
  pullRequestId: string;
  prTitle: string;
  prNumber: number;
  providerPrId: string;
  repositoryId: string;
  repositoryName: string;
  repositoryFullName: string;
}

export interface ReviewRunDetailRow extends ReviewRunListRow {
  triggerEventId: string | null;
  queueJobId: string | null;
  retryCount: number;
  ruleSnapshot: unknown;
}

export interface ListReviewRunsOptions {
  organizationId: string;
  status?: string | null;
  page: number;
  perPage: number;
}

export interface ListReviewRunsResult {
  rows: ReviewRunListRow[];
  totalCount: number;
}

const VALID_RUN_STATUSES = new Set([
  "queued",
  "running",
  "succeeded",
  "failed",
  "retrying",
  "cancelled",
]);

function normalizeStatusFilter(
  status: string | null | undefined
): string | null {
  if (!status) return null;
  return VALID_RUN_STATUSES.has(status) ? status : null;
}

export async function listReviewRuns(
  opts: ListReviewRunsOptions
): Promise<ListReviewRunsResult> {
  const logger = createLogger({ component: "queue" });
  try {
    const status = normalizeStatusFilter(opts.status);
    const limit = Math.max(1, Math.min(opts.perPage, 100));
    const offset = Math.max(0, (opts.page - 1) * limit);

    const params: unknown[] = [opts.organizationId];
    let statusFilter = "";
    if (status) {
      params.push(status);
      statusFilter = `and rr.status = $${params.length}::public.review_run_status`;
    }

    const countResult = await getPool().query<{ total: string }>(
      `select count(*)::bigint as total
         from public.review_runs rr
        where rr.organization_id = $1
          ${statusFilter}`,
      params
    );
    const totalCount = Number(countResult.rows[0]?.total ?? 0);

    params.push(limit, offset);
    const result = await getPool().query<{
      id: string;
      run_number: string;
      trigger_type: string;
      status: string;
      review_mode: string;
      output_language: string;
      summary_md: string | null;
      findings_count: string;
      analyzed_files_count: string;
      security_findings_count: string;
      started_at: Date | null;
      finished_at: Date | null;
      error_code: string | null;
      error_message: string | null;
      base_sha: string;
      head_sha: string;
      ai_model_name: string | null;
      created_at: Date;
      pr_id: string;
      pr_title: string;
      pr_number: string;
      provider_pr_id: string;
      repo_id: string;
      repo_name: string;
      repo_full_name: string;
    }>(
      `select rr.id, rr.run_number, rr.trigger_type, rr.status,
              rr.review_mode, rr.output_language, rr.summary_md,
              rr.findings_count, rr.analyzed_files_count,
              rr.security_findings_count,
              rr.started_at, rr.finished_at,
              rr.error_code, rr.error_message,
              rr.base_sha, rr.head_sha, rr.ai_model_name,
              rr.created_at,
              pr.id as pr_id, pr.title as pr_title,
              pr.provider_pr_number as pr_number,
              pr.provider_pr_id,
              r.id as repo_id, r.name as repo_name,
              r.full_name as repo_full_name
         from public.review_runs rr
         join public.pull_requests pr on pr.id = rr.pull_request_id
         join public.repositories r on r.id = rr.repository_id
        where rr.organization_id = $1
          ${statusFilter}
        order by rr.created_at desc
        limit $${params.length - 1} offset $${params.length}`,
      params
    );

    return {
      rows: result.rows.map((row) => ({
        id: row.id,
        runNumber: Number(row.run_number),
        triggerType: row.trigger_type,
        status: row.status,
        reviewMode: row.review_mode,
        outputLanguage: row.output_language,
        summaryMd: row.summary_md,
        findingsCount: Number(row.findings_count),
        analyzedFilesCount: Number(row.analyzed_files_count),
        securityFindingsCount: Number(row.security_findings_count),
        startedAt: row.started_at,
        finishedAt: row.finished_at,
        errorCode: row.error_code,
        errorMessage: row.error_message,
        baseSha: row.base_sha,
        headSha: row.head_sha,
        aiModelName: row.ai_model_name,
        createdAt: row.created_at,
        pullRequestId: row.pr_id,
        prTitle: row.pr_title,
        prNumber: Number(row.pr_number),
        providerPrId: row.provider_pr_id,
        repositoryId: row.repo_id,
        repositoryName: row.repo_name,
        repositoryFullName: row.repo_full_name,
      })),
      totalCount,
    };
  } catch (error) {
    logger.error("Failed to list review runs", error as Error, {
      operation: "list_review_runs",
      organization_id: opts.organizationId,
    });
    throw new AppError(
      ErrorCode.DependencyDatabaseConnection,
      "Failed to list review runs"
    );
  }
}

export async function getReviewRunDetail(
  id: string,
  organizationId: string
): Promise<ReviewRunDetailRow | null> {
  const logger = createLogger({ component: "queue" });
  try {
    const result = await getPool().query<{
      id: string;
      run_number: string;
      trigger_type: string;
      status: string;
      review_mode: string;
      output_language: string;
      summary_md: string | null;
      findings_count: string;
      analyzed_files_count: string;
      security_findings_count: string;
      started_at: Date | null;
      finished_at: Date | null;
      error_code: string | null;
      error_message: string | null;
      base_sha: string;
      head_sha: string;
      ai_model_name: string | null;
      created_at: Date;
      trigger_event_id: string | null;
      queue_job_id: string | null;
      retry_count: string;
      rule_snapshot: unknown;
      pr_id: string;
      pr_title: string;
      pr_number: string;
      provider_pr_id: string;
      repo_id: string;
      repo_name: string;
      repo_full_name: string;
    }>(
      `select rr.id, rr.run_number, rr.trigger_type, rr.status,
              rr.review_mode, rr.output_language, rr.summary_md,
              rr.findings_count, rr.analyzed_files_count,
              rr.security_findings_count,
              rr.started_at, rr.finished_at,
              rr.error_code, rr.error_message,
              rr.base_sha, rr.head_sha, rr.ai_model_name,
              rr.created_at,
              rr.trigger_event_id, rr.queue_job_id,
              rr.retry_count, rr.rule_snapshot,
              pr.id as pr_id, pr.title as pr_title,
              pr.provider_pr_number as pr_number,
              pr.provider_pr_id,
              r.id as repo_id, r.name as repo_name,
              r.full_name as repo_full_name
         from public.review_runs rr
         join public.pull_requests pr on pr.id = rr.pull_request_id
         join public.repositories r on r.id = rr.repository_id
        where rr.id = $1
          and rr.organization_id = $2`,
      [id, organizationId]
    );
    const row = result.rows[0];
    if (!row) return null;
    return {
      id: row.id,
      runNumber: Number(row.run_number),
      triggerType: row.trigger_type,
      status: row.status,
      reviewMode: row.review_mode,
      outputLanguage: row.output_language,
      summaryMd: row.summary_md,
      findingsCount: Number(row.findings_count),
      analyzedFilesCount: Number(row.analyzed_files_count),
      securityFindingsCount: Number(row.security_findings_count),
      startedAt: row.started_at,
      finishedAt: row.finished_at,
      errorCode: row.error_code,
      errorMessage: row.error_message,
      baseSha: row.base_sha,
      headSha: row.head_sha,
      aiModelName: row.ai_model_name,
      createdAt: row.created_at,
      pullRequestId: row.pr_id,
      prTitle: row.pr_title,
      prNumber: Number(row.pr_number),
      providerPrId: row.provider_pr_id,
      repositoryId: row.repo_id,
      repositoryName: row.repo_name,
      repositoryFullName: row.repo_full_name,
      triggerEventId: row.trigger_event_id,
      queueJobId: row.queue_job_id,
      retryCount: Number(row.retry_count),
      ruleSnapshot: row.rule_snapshot,
    };
  } catch (error) {
    logger.error("Failed to fetch review run detail", error as Error, {
      operation: "get_review_run_detail",
      review_run_id: id,
      organization_id: organizationId,
    });
    throw new AppError(
      ErrorCode.DependencyDatabaseConnection,
      "Failed to fetch review run detail"
    );
  }
}

export async function listRecentReviewRuns(
  organizationId: string,
  limit: number
): Promise<ReviewRunListRow[]> {
  const logger = createLogger({ component: "queue" });
  try {
    const result = await getPool().query<{
      id: string;
      run_number: string;
      trigger_type: string;
      status: string;
      review_mode: string;
      output_language: string;
      summary_md: string | null;
      findings_count: string;
      analyzed_files_count: string;
      security_findings_count: string;
      started_at: Date | null;
      finished_at: Date | null;
      error_code: string | null;
      error_message: string | null;
      base_sha: string;
      head_sha: string;
      ai_model_name: string | null;
      created_at: Date;
      pr_id: string;
      pr_title: string;
      pr_number: string;
      provider_pr_id: string;
      repo_id: string;
      repo_name: string;
      repo_full_name: string;
    }>(
      `select rr.id, rr.run_number, rr.trigger_type, rr.status,
              rr.review_mode, rr.output_language, rr.summary_md,
              rr.findings_count, rr.analyzed_files_count,
              rr.security_findings_count,
              rr.started_at, rr.finished_at,
              rr.error_code, rr.error_message,
              rr.base_sha, rr.head_sha, rr.ai_model_name,
              rr.created_at,
              pr.id as pr_id, pr.title as pr_title,
              pr.provider_pr_number as pr_number,
              pr.provider_pr_id,
              r.id as repo_id, r.name as repo_name,
              r.full_name as repo_full_name
         from public.review_runs rr
         join public.pull_requests pr on pr.id = rr.pull_request_id
         join public.repositories r on r.id = rr.repository_id
        where rr.organization_id = $1
        order by rr.created_at desc
        limit $2`,
      [organizationId, limit]
    );

    return result.rows.map((row) => ({
      id: row.id,
      runNumber: Number(row.run_number),
      triggerType: row.trigger_type,
      status: row.status,
      reviewMode: row.review_mode,
      outputLanguage: row.output_language,
      summaryMd: row.summary_md,
      findingsCount: Number(row.findings_count),
      analyzedFilesCount: Number(row.analyzed_files_count),
      securityFindingsCount: Number(row.security_findings_count),
      startedAt: row.started_at,
      finishedAt: row.finished_at,
      errorCode: row.error_code,
      errorMessage: row.error_message,
      baseSha: row.base_sha,
      headSha: row.head_sha,
      aiModelName: row.ai_model_name,
      createdAt: row.created_at,
      pullRequestId: row.pr_id,
      prTitle: row.pr_title,
      prNumber: Number(row.pr_number),
      providerPrId: row.provider_pr_id,
      repositoryId: row.repo_id,
      repositoryName: row.repo_name,
      repositoryFullName: row.repo_full_name,
    }));
  } catch (error) {
    logger.error("Failed to list recent review runs", error as Error, {
      operation: "list_recent_review_runs",
      organization_id: organizationId,
    });
    throw new AppError(
      ErrorCode.DependencyDatabaseConnection,
      "Failed to list recent review runs"
    );
  }
}

export async function getReviewRunCount(
  organizationId: string,
  sinceDays: number
): Promise<number> {
  const logger = createLogger({ component: "queue" });
  try {
    const result = await getPool().query<{ count: string }>(
      `select count(*)::bigint as count
         from public.review_runs
        where organization_id = $1
          and created_at >= now() - ($2::int * interval '1 day')`,
      [organizationId, sinceDays]
    );
    return Number(result.rows[0]?.count ?? 0);
  } catch (error) {
    logger.error("Failed to count review runs", error as Error, {
      operation: "get_review_run_count",
      organization_id: organizationId,
    });
    throw new AppError(
      ErrorCode.DependencyDatabaseConnection,
      "Failed to count review runs"
    );
  }
}

export async function getReviewRunStatus(
  id: string
): Promise<string | null> {
  const result = await getPool().query<{ status: string }>(
    "select status from public.review_runs where id = $1",
    [id]
  );
  return result.rows[0]?.status ?? null;
}

export async function cancelReviewRun(id: string): Promise<boolean> {
  const logger = createLogger({ component: "queue" });
  try {
    const result = await getPool().query(
      `update public.review_runs
          set status = 'cancelling', updated_at = now()
        where id = $1
          and status in ('queued', 'running')
        returning id`,
      [id]
    );
    const success = (result.rowCount ?? 0) > 0;
    if (success) {
      logger.info("Review run set to cancelling", { review_run_id: id });
    } else {
      logger.warn("Review run not found or not in cancellable state", {
        review_run_id: id,
      });
    }
    return success;
  } catch (error) {
    logger.error("Failed to cancel review run", error as Error, {
      operation: "cancel_review_run",
      review_run_id: id,
    });
    throw new AppError(
      ErrorCode.DependencyDatabaseConnection,
      "Failed to cancel review run"
    );
  }
}

export async function getReviewRunSuccessRate(
  organizationId: string,
  sinceDays: number
): Promise<{ total: number; succeeded: number; rate: number }> {
  const logger = createLogger({ component: "queue" });
  try {
    const result = await getPool().query<{ total: string; succeeded: string }>(
      `select
         count(*)::bigint as total,
         count(*) filter (where status = 'succeeded')::bigint as succeeded
       from public.review_runs
       where organization_id = $1
         and created_at >= now() - ($2::int * interval '1 day')`,
      [organizationId, sinceDays]
    );
    const total = Number(result.rows[0]?.total ?? 0);
    const succeeded = Number(result.rows[0]?.succeeded ?? 0);
    const rate = total > 0 ? (succeeded / total) * 100 : 0;
    return { total, succeeded, rate };
  } catch (error) {
    logger.error("Failed to compute review run success rate", error as Error, {
      operation: "get_review_run_success_rate",
      organization_id: organizationId,
    });
    throw new AppError(
      ErrorCode.DependencyDatabaseConnection,
      "Failed to compute review run success rate"
    );
  }
}
