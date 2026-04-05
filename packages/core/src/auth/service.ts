import { AppError, ErrorCode } from "../errors.js";
import {
  createLocalCredential,
  createLocalIdentity,
  createOrganizationWithOwner,
  createSession,
  expireSession,
  findLocalCredentialByEmail,
  findSessionWithUser,
  findUserByEmail,
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
    throw new Error(AUTH_EMAIL_ALREADY_EXISTS);
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
    throw new Error(AUTH_INVALID_CREDENTIALS);
  }

  const isValid = await verifyPassword(input.password, record.password_hash);
  if (!isValid) {
    throw new Error(AUTH_INVALID_CREDENTIALS);
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
