import { Pool } from "pg";

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

export async function getOrgIdForUser(userId: string): Promise<string | null> {
  const result = await getPool().query<{ id: string }>(
    `select o.id
       from public.organizations o
       join public.memberships m on m.organization_id = o.id
      where m.user_id = $1 and m.status = 'active'
      limit 1`,
    [userId]
  );
  return result.rows[0]?.id ?? null;
}

export async function getOrganizationName(
  orgId: string
): Promise<string | null> {
  const result = await getPool().query<{ name: string }>(
    `select name from public.organizations where id = $1 limit 1`,
    [orgId]
  );
  return result.rows[0]?.name ?? null;
}
