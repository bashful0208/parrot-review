import { Pool, type PoolClient } from "pg";

import { createLogger } from "../logging.js";
import { AppError, ErrorCode } from "../errors.js";

export interface AuthUserRecord {
  id: string;
  email: string | null;
  display_name: string | null;
}

export interface AuthIdentityRecord {
  id: string;
  user_id: string;
  provider: string;
  subject: string;
  email: string | null;
}

export interface SessionRecord {
  id: string;
  user_id: string;
  session_token_hash: string;
  expires_at: Date;
}

const logger = createLogger({ component: "api" });
let pool: Pool | null = null;

function getPool(): Pool {
  if (!pool) {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      throw new AppError(
        ErrorCode.DependencyDatabaseConnection,
        "DATABASE_URL is required for authentication"
      );
    }

    pool = new Pool({ connectionString: databaseUrl });
  }

  return pool;
}

export async function withAuthTransaction<T>(
  callback: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await getPool().connect();

  try {
    await client.query("begin");
    const result = await callback(client);
    await client.query("commit");
    return result;
  } catch (error) {
    await client.query("rollback");
    logger.error("Auth transaction failed", error);
    throw error;
  } finally {
    client.release();
  }
}

export async function findUserByEmail(email: string): Promise<AuthUserRecord | null> {
  const result = await getPool().query<AuthUserRecord>(
    `select id, email, display_name
       from public.app_users
      where lower(email) = lower($1)
      limit 1`,
    [email]
  );

  return result.rows[0] ?? null;
}

export async function createUser(
  client: PoolClient,
  input: { email: string; displayName: string }
): Promise<AuthUserRecord> {
  const result = await client.query<AuthUserRecord>(
    `insert into public.app_users (email, display_name)
     values ($1, $2)
     returning id, email, display_name`,
    [input.email, input.displayName]
  );

  return result.rows[0];
}

export async function createLocalIdentity(
  client: PoolClient,
  input: { userId: string; email: string }
): Promise<AuthIdentityRecord> {
  const result = await client.query<AuthIdentityRecord>(
    `insert into public.auth_identities (user_id, provider, subject, email)
     values ($1, 'local', lower($2), lower($2))
     returning id, user_id, provider, subject, email`,
    [input.userId, input.email]
  );

  return result.rows[0];
}

export async function createLocalCredential(
  client: PoolClient,
  input: { userId: string; passwordHash: string }
): Promise<void> {
  await client.query(
    `insert into public.local_credentials (user_id, password_hash)
     values ($1, $2)`,
    [input.userId, input.passwordHash]
  );
}

export async function findLocalCredentialByEmail(email: string): Promise<
  | {
      user: AuthUserRecord;
      password_hash: string;
    }
  | null
> {
  const result = await getPool().query<
    AuthUserRecord & {
      password_hash: string;
    }
  >(
    `select u.id, u.email, u.display_name, c.password_hash
       from public.auth_identities i
       join public.app_users u on u.id = i.user_id
       join public.local_credentials c on c.user_id = u.id
      where i.provider = 'local'
        and lower(i.subject) = lower($1)
      limit 1`,
    [email]
  );

  const row = result.rows[0];
  if (!row) {
    return null;
  }

  return {
    user: {
      id: row.id,
      email: row.email,
      display_name: row.display_name,
    },
    password_hash: row.password_hash,
  };
}

export async function createSession(
  client: PoolClient,
  input: { userId: string; sessionTokenHash: string; expiresAt: Date; ipAddress?: string | null; userAgent?: string | null }
): Promise<SessionRecord> {
  const result = await client.query<SessionRecord>(
    `insert into public.user_sessions (user_id, session_token_hash, expires_at, ip_address, user_agent)
     values ($1, $2, $3, $4, $5)
     returning id, user_id, session_token_hash, expires_at`,
    [input.userId, input.sessionTokenHash, input.expiresAt, input.ipAddress ?? null, input.userAgent ?? null]
  );

  return result.rows[0];
}

export async function findSessionWithUser(sessionTokenHash: string): Promise<
  | {
      session: SessionRecord;
      user: AuthUserRecord;
    }
  | null
> {
  const result = await getPool().query<
    SessionRecord & AuthUserRecord
  >(
    `select s.id, s.user_id, s.session_token_hash, s.expires_at,
            u.email, u.display_name
       from public.user_sessions s
       join public.app_users u on u.id = s.user_id
      where s.session_token_hash = $1
        and s.expires_at > now()
      limit 1`,
    [sessionTokenHash]
  );

  const row = result.rows[0];
  if (!row) {
    return null;
  }

  return {
    session: {
      id: row.id,
      user_id: row.user_id,
      session_token_hash: row.session_token_hash,
      expires_at: row.expires_at,
    },
    user: {
      id: row.user_id,
      email: row.email,
      display_name: row.display_name,
    },
  };
}

export interface OrgRecord {
  id: string;
}

export async function createOrganizationWithOwner(
  client: PoolClient,
  input: { name: string; slug: string; ownerUserId: string }
): Promise<OrgRecord> {
  const org = await client.query<OrgRecord>(
    `insert into public.organizations (name, slug, owner_user_id)
     values ($1, $2, $3)
     returning id`,
    [input.name, input.slug, input.ownerUserId]
  );

  await client.query(
    `insert into public.memberships (organization_id, user_id, role, status, joined_at)
     values ($1, $2, 'owner', 'active', now())`,
    [org.rows[0]!.id, input.ownerUserId]
  );

  return org.rows[0]!;
}

export async function expireSession(sessionTokenHash: string): Promise<void> {
  await getPool().query(
    `delete from public.user_sessions where session_token_hash = $1`,
    [sessionTokenHash]
  );
}

export async function createPasswordResetToken(
  client: PoolClient,
  input: { userId: string; tokenHash: string; expiresAt: Date }
): Promise<void> {
  await client.query(
    `insert into public.password_reset_tokens (user_id, token_hash, expires_at)
     values ($1, $2, $3)`,
    [input.userId, input.tokenHash, input.expiresAt]
  );
}

export async function findValidPasswordResetToken(tokenHash: string): Promise<
  { id: string; user_id: string } | null
> {
  const result = await getPool().query(
    `select id, user_id
       from public.password_reset_tokens
      where token_hash = $1
        and expires_at > now()
        and used_at is null
      limit 1`,
    [tokenHash]
  );
  return result.rows[0] ?? null;
}

export async function markPasswordResetTokenUsed(
  client: PoolClient,
  tokenId: string
): Promise<void> {
  await client.query(
    `update public.password_reset_tokens set used_at = now() where id = $1`,
    [tokenId]
  );
}

export async function updatePassword(
  client: PoolClient,
  input: { userId: string; passwordHash: string }
): Promise<void> {
  await client.query(
    `update public.local_credentials
        set password_hash = $2, password_updated_at = now()
      where user_id = $1`,
    [input.userId, input.passwordHash]
  );
}
