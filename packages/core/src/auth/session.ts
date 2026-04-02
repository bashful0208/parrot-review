import { createHash, randomBytes } from "node:crypto";

export const AUTH_SESSION_COOKIE = "reviewer_session";
const SESSION_BYTES = 32;
const SESSION_TTL_DAYS = 14;

export function createSessionToken(): string {
  return randomBytes(SESSION_BYTES).toString("base64url");
}

export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function getSessionExpiry(): Date {
  return new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000);
}
