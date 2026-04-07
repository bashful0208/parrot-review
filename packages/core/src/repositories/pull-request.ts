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

export interface UpsertPullRequestInput {
  organizationId: string;
  repositoryId: string;
  providerPrId: string;
  providerPrNumber: number;
  title: string;
  description: string | null;
  authorLogin: string | null;
  baseBranch: string;
  headBranch: string;
  baseSha: string;
  headSha: string;
  state: string;
  openedAt: Date;
}

export async function upsertPullRequest(
  input: UpsertPullRequestInput
): Promise<{ id: string }> {
  const logger = createLogger({ component: "queue" });
  try {
    const result = await getPool().query<{ id: string }>(
      `insert into public.pull_requests
         (organization_id, repository_id, provider_pr_id, provider_pr_number,
          title, description, author_login, base_branch, head_branch,
          base_sha, head_sha, state, opened_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       on conflict (repository_id, provider_pr_id) do update
         set head_sha = excluded.head_sha,
             state = excluded.state,
             updated_at = now()
       returning id`,
      [
        input.organizationId,
        input.repositoryId,
        input.providerPrId,
        input.providerPrNumber,
        input.title,
        input.description,
        input.authorLogin,
        input.baseBranch,
        input.headBranch,
        input.baseSha,
        input.headSha,
        input.state,
        input.openedAt,
      ]
    );

    const row = result.rows[0]!;
    logger.info("Pull request upserted", {
      pull_request_id: row.id,
      repository_id: input.repositoryId,
      provider_pr_id: input.providerPrId,
    });

    return { id: row.id };
  } catch (error) {
    logger.error("Failed to upsert pull request", error as Error, {
      operation: "upsert_pull_request",
      repository_id: input.repositoryId,
      provider_pr_id: input.providerPrId,
    });
    throw new AppError(
      ErrorCode.DependencyDatabaseConnection,
      "Failed to upsert pull request"
    );
  }
}
