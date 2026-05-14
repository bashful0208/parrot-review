import { AppError, ErrorCode } from "../errors.js";
import { createLogger } from "../logging.js";
import {
  createLocalCredential,
  createLocalIdentity,
  createOrganizationWithOwner,
  createPasswordResetToken,
  createSession,
  expireSession,
  findLocalCredentialByEmail,
  findSessionWithUser,
  findUserByEmail,
  findValidPasswordResetToken,
  markPasswordResetTokenUsed,
  updatePassword,
  createUser,
  withAuthTransaction,
} from "./repository.ts";
import { hashPassword, verifyPassword } from "./password.ts";
import {
  createSessionToken,
  getSessionExpiry,
  hashSessionToken,
} from "./session.ts";

export const AUTH_INVALID_CREDENTIALS = "Invalid email or password.";
export const AUTH_EMAIL_ALREADY_EXISTS = "An account with this email already exists.";

export interface AuthenticatedUser {
  id: string;
  email: string;
  name?: string;
}

export interface AuthSessionResult {
  token: string;
  expiresAt: Date;
  user: AuthenticatedUser;
  provider: "local";
}

function mapUser(record: { id: string; email: string | null; display_name: string | null }): AuthenticatedUser {
  if (!record.email) {
    throw new AppError(
      ErrorCode.DependencyDatabaseConnection,
      "Authenticated user is missing an email"
    );
  }

  return {
    id: record.id,
    email: record.email,
    name: record.display_name ?? undefined,
  };
}

export async function registerWithPassword(input: {
  email: string;
  password: string;
  ipAddress?: string | null;
  userAgent?: string | null;
}): Promise<AuthSessionResult> {
  const existingUser = await findUserByEmail(input.email);
  if (existingUser) {
    throw new AppError(ErrorCode.ValidationFailed, AUTH_EMAIL_ALREADY_EXISTS);
  }

  const passwordHash = await hashPassword(input.password);
  const token = createSessionToken();
  const tokenHash = hashSessionToken(token);
  const expiresAt = getSessionExpiry();
  const displayName = input.email.split("@")[0];

  const user = await withAuthTransaction(async (client) => {
    const createdUser = await createUser(client, {
      email: input.email.toLowerCase(),
      displayName,
    });

    await createLocalIdentity(client, {
      userId: createdUser.id,
      email: input.email,
    });

    await createLocalCredential(client, {
      userId: createdUser.id,
      passwordHash,
    });

    const slug = `${displayName.toLowerCase().replace(/[^a-z0-9]/g, "-")}-${Math.random().toString(36).slice(2, 8)}`;
    await createOrganizationWithOwner(client, {
      name: `${displayName}'s Workspace`,
      slug,
      ownerUserId: createdUser.id,
    });

    await createSession(client, {
      userId: createdUser.id,
      sessionTokenHash: tokenHash,
      expiresAt,
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
    });

    return createdUser;
  });

  return {
    token,
    expiresAt,
    provider: "local",
    user: mapUser(user),
  };
}

export async function loginWithPassword(input: {
  email: string;
  password: string;
  ipAddress?: string | null;
  userAgent?: string | null;
}): Promise<AuthSessionResult> {
  const record = await findLocalCredentialByEmail(input.email);
  if (!record) {
    throw new AppError(ErrorCode.ValidationFailed, AUTH_INVALID_CREDENTIALS);
  }

  const isValid = await verifyPassword(input.password, record.password_hash);
  if (!isValid) {
    throw new AppError(ErrorCode.ValidationFailed, AUTH_INVALID_CREDENTIALS);
  }

  const token = createSessionToken();
  const tokenHash = hashSessionToken(token);
  const expiresAt = getSessionExpiry();

  await withAuthTransaction(async (client) => {
    await createSession(client, {
      userId: record.user.id,
      sessionTokenHash: tokenHash,
      expiresAt,
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
    });
  });

  return {
    token,
    expiresAt,
    provider: "local",
    user: mapUser(record.user),
  };
}

export async function getSessionUser(sessionToken: string): Promise<AuthenticatedUser | null> {
  const record = await findSessionWithUser(hashSessionToken(sessionToken));
  if (!record) {
    return null;
  }

  return mapUser(record.user);
}

export async function invalidateSession(sessionToken: string): Promise<void> {
  await expireSession(hashSessionToken(sessionToken));
}

export async function requestPasswordReset(input: {
  email: string;
}): Promise<void> {
  const user = await findUserByEmail(input.email);
  if (!user) {
    // Don't reveal whether email exists
    return;
  }

  const token = createSessionToken();
  const tokenHash = hashSessionToken(token);
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

  await withAuthTransaction(async (client) => {
    await createPasswordResetToken(client, {
      userId: user.id,
      tokenHash,
      expiresAt,
    });
  });

  // TODO: Send email with reset link containing token
  const logger = createLogger({ component: "auth" });
  logger.info("Password reset token generated", {
    userId: user.id,
  });
}

export async function resetPassword(input: {
  token: string;
  newPassword: string;
}): Promise<void> {
  const tokenHash = hashSessionToken(input.token);
  const resetRecord = await findValidPasswordResetToken(tokenHash);

  if (!resetRecord) {
    throw new AppError(ErrorCode.ValidationFailed, "Invalid or expired reset token.");
  }

  const passwordHash = await hashPassword(input.newPassword);

  await withAuthTransaction(async (client) => {
    await updatePassword(client, {
      userId: resetRecord.user_id,
      passwordHash,
    });
    await markPasswordResetTokenUsed(client, resetRecord.id);
    // Invalidate all existing sessions for this user
    await client.query(
      `delete from public.user_sessions where user_id = $1`,
      [resetRecord.user_id]
    );
  });
}
