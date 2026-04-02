import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

const repoRoot = "/Users/bashful/work/code/reviewer";

const read = (relativePath) =>
  readFile(path.join(repoRoot, relativePath), "utf8");

test("login page keeps only the login surface", async () => {
  const page = await read("apps/web/src/app/login/page.tsx");

  assert.match(page, /Sign in to Reviewer/i);
  assert.match(page, /max-w-\[420px\]/i);
  assert.doesNotMatch(page, /macOS-style access/i);
  assert.doesNotMatch(page, /window control dots/i);
  assert.doesNotMatch(page, /Desktop ready/i);
  assert.doesNotMatch(page, /Clear focus/i);
  assert.doesNotMatch(page, /SocialLoginGroup/i);
  assert.doesNotMatch(page, /Divider/i);
});

test("login form keeps accessibility while switching to minimal support copy", async () => {
  const form = await read("apps/web/src/components/auth/LoginForm.tsx");

  assert.match(form, /Use your workspace email to sign in\./i);
  assert.match(form, /rounded-\[18px\]/i);
  assert.doesNotMatch(form, /Designed for quiet, focused code review sessions\./i);
  assert.match(form, /htmlFor="login-email"/i);
  assert.match(form, /id="login-email"/i);
  assert.match(form, /aria-invalid=\{Boolean\(emailError\)\}/i);
  assert.match(form, /aria-describedby=\{emailError \? "login-email-error" : undefined\}/i);
  assert.match(form, /htmlFor="login-password"/i);
  assert.match(form, /id="login-password"/i);
  assert.match(form, /aria-invalid=\{Boolean\(passwordError\)\}/i);
  assert.match(form, /aria-describedby=\{passwordError \? "login-password-error" : undefined\}/i);
});

test("register page reuses the same minimalist auth shell", async () => {
  const page = await read("apps/web/src/app/register/page.tsx");
  const form = await read("apps/web/src/components/auth/RegisterForm.tsx");

  assert.match(page, /Sign up for Reviewer/i);
  assert.match(page, /max-w-\[420px\]/i);
  assert.match(page, /<Brand size="medium"/i);
  assert.match(form, /confirmPassword/i);
  assert.match(form, /htmlFor="register-confirm-password"/i);
  assert.match(form, /id="register-confirm-password"/i);
  assert.match(form, /已有账号？/i);
});

test("auth routes cover both login and register contracts", async () => {
  const loginRoute = await read("apps/web/src/app/api/auth/login/route.ts");
  const registerRoute = await read("apps/web/src/app/api/auth/register/route.ts");
  const validators = await read("apps/web/src/lib/auth/validators.ts");
  const types = await read("apps/web/src/lib/auth/types.ts");

  assert.match(loginRoute, /request_id/i);
  assert.match(registerRoute, /request_id/i);
  assert.match(registerRoute, /confirmPassword/i);
  assert.match(registerRoute, /local/i);
  assert.match(validators, /validateConfirmPassword/i);
  assert.match(types, /RegisterCredentials/i);
});

test("login page preserves the existing login flow contract", async () => {
  const page = await read("apps/web/src/app/login/page.tsx");
  const form = await read("apps/web/src/components/auth/LoginForm.tsx");

  assert.match(page, /fetch\("\/api\/auth\/login"/i);
  assert.match(page, /JSON\.stringify\(\{ email, password \}\)/i);
  assert.match(page, /localStorage\.setItem\("user", JSON\.stringify\(data\.user\)\)/i);
  assert.match(page, /router\.push\("\/"\)/i);
  assert.match(page, /setError\("网络错误，请稍后重试"\)/i);
  assert.match(form, /disabled=\{loading\}/i);
  assert.match(form, /密码长度至少6位/i);
  assert.match(form, /邮箱格式不正确/i);
});

test("brand component stays non-heading and compact", async () => {
  const brand = await read("apps/web/src/components/Brand.tsx");

  assert.doesNotMatch(brand, /<h1/i);
  assert.match(brand, /rounded-\[14px\]/i);
});
