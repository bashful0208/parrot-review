import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

const repoRoot = "/Users/bashful/work/code/reviewer";

const read = (relativePath) =>
  readFile(path.join(repoRoot, relativePath), "utf8");

test("auth schema supports local credentials sessions and external identities", async () => {
  const migration = await read("postgres/migrations/0003_auth_sessions.sql");

  assert.match(migration, /create table if not exists public\.auth_identities/i);
  assert.match(migration, /create table if not exists public\.local_credentials/i);
  assert.match(migration, /create table if not exists public\.user_sessions/i);
  assert.match(migration, /provider text not null/i);
  assert.match(migration, /password_hash text not null/i);
  assert.match(migration, /session_token_hash text not null/i);
});

test("core exports real auth service building blocks", async () => {
  const coreIndex = await read("packages/core/src/index.ts");
  const authService = await read("packages/core/src/auth/service.ts");
  const authRepo = await read("packages/core/src/auth/repository.ts");
  const authSession = await read("packages/core/src/auth/session.ts");
  const authPassword = await read("packages/core/src/auth/password.ts");

  assert.match(coreIndex, /export \* from "\.\/auth\/index\.ts";/i);
  assert.match(authService, /registerWithPassword/i);
  assert.match(authService, /loginWithPassword/i);
  assert.match(authRepo, /createLocalIdentity/i);
  assert.match(authSession, /createSessionToken/i);
  assert.match(authPassword, /hashPassword/i);
});

test("web auth routes use real auth services and session cookies", async () => {
  const loginRoute = await read("apps/web/src/app/api/auth/login/route.ts");
  const registerRoute = await read("apps/web/src/app/api/auth/register/route.ts");
  const logoutRoute = await read("apps/web/src/app/api/auth/logout/route.ts");

  assert.match(loginRoute, /loginWithPassword/i);
  assert.match(registerRoute, /registerWithPassword/i);
  assert.match(loginRoute, /response\.cookies\.set/i);
  assert.match(registerRoute, /response\.cookies\.set/i);
  assert.match(logoutRoute, /response\.cookies\.set/i);
  assert.match(logoutRoute, /invalidateSession/i);
  assert.match(logoutRoute, /new URL\("\/login", request\.url\)/i);
});

test("auth services classify invalid credentials and duplicate emails without dependency exits", async () => {
  const authService = await read("packages/core/src/auth/service.ts");
  const loginRoute = await read("apps/web/src/app/api/auth/login/route.ts");
  const registerRoute = await read("apps/web/src/app/api/auth/register/route.ts");

  assert.match(authService, /AUTH_EMAIL_ALREADY_EXISTS/i);
  assert.match(authService, /AUTH_INVALID_CREDENTIALS/i);
  assert.match(loginRoute, /status = message === AUTH_INVALID_CREDENTIALS \? 401 : 500/i);
  assert.match(registerRoute, /status = message === AUTH_EMAIL_ALREADY_EXISTS \? 409 : 500/i);
  assert.doesNotMatch(loginRoute, /ensureErrorLogged\(error, requestLogger/i);
  assert.doesNotMatch(registerRoute, /ensureErrorLogged\(error, requestLogger/i);
});

test("frontend auth flow stops relying on localStorage", async () => {
  const loginPage = await read("apps/web/src/app/login/page.tsx");
  const registerPage = await read("apps/web/src/app/register/page.tsx");
  const homePage = await read("apps/web/src/app/page.tsx");

  assert.doesNotMatch(loginPage, /localStorage/i);
  assert.doesNotMatch(registerPage, /localStorage/i);
  assert.doesNotMatch(homePage, /localStorage/i);
  assert.match(homePage, /cookies/i);
  assert.match(homePage, /redirect\("\/login"\)/i);
});
