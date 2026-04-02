import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

const repoRoot = "/Users/bashful/work/code/reviewer";

const read = (relativePath) =>
  readFile(path.join(repoRoot, relativePath), "utf8");

test("login page keeps only the login form in English", async () => {
  const page = await read("apps/web/src/app/login/page.tsx");

  assert.match(page, /Sign in/i);
  assert.match(page, /max-w-\[420px\]/i);
  assert.doesNotMatch(page, /Sign in to Reviewer/i);
  assert.doesNotMatch(page, /Continue with your workspace account\./i);
  assert.doesNotMatch(page, /<Brand size="medium"/i);
});

test("login form is English-only and keeps accessibility wiring", async () => {
  const form = await read("apps/web/src/components/auth/LoginForm.tsx");

  assert.match(form, /Use your email to sign in\./i);
  assert.match(form, /Password/i);
  assert.match(form, /Forgot password\?/i);
  assert.match(form, /Create account/i);
  assert.doesNotMatch(form, /工作邮箱/i);
  assert.doesNotMatch(form, /密码/i);
  assert.doesNotMatch(form, /立即注册/i);
  assert.match(form, /htmlFor="login-email"/i);
  assert.match(form, /id="login-email"/i);
  assert.match(form, /aria-invalid=\{Boolean\(emailError\)\}/i);
  assert.match(form, /aria-describedby=\{emailError \? "login-email-error" : undefined\}/i);
});

test("register page keeps the same minimalist shell in English", async () => {
  const page = await read("apps/web/src/app/register/page.tsx");
  const form = await read("apps/web/src/components/auth/RegisterForm.tsx");

  assert.match(page, /Create account/i);
  assert.doesNotMatch(page, /Sign up for Reviewer/i);
  assert.doesNotMatch(page, /Create your workspace account and continue\./i);
  assert.doesNotMatch(page, /<Brand size="medium"/i);
  assert.match(form, /Confirm password/i);
  assert.match(form, /Already have an account\?/i);
  assert.doesNotMatch(form, /已有账号？/i);
  assert.doesNotMatch(form, /工作邮箱/i);
});

test("auth validation copy is English-only", async () => {
  const loginRoute = await read("apps/web/src/app/api/auth/login/route.ts");
  const registerRoute = await read("apps/web/src/app/api/auth/register/route.ts");
  const validators = await read("apps/web/src/lib/auth/validators.ts");

  assert.match(validators, /Email is required\./i);
  assert.match(validators, /Enter a valid email address\./i);
  assert.match(validators, /Password is required\./i);
  assert.match(validators, /Password must be at least 6 characters\./i);
  assert.match(validators, /Please confirm your password\./i);
  assert.match(validators, /Passwords do not match\./i);
  assert.doesNotMatch(validators, /邮箱不能为空|邮箱格式不正确|密码不能为空|密码长度至少6位|请再次输入密码|两次输入的密码不一致/i);
  assert.doesNotMatch(loginRoute, /登录失败|网络错误，请稍后重试/i);
  assert.doesNotMatch(registerRoute, /注册失败|网络错误，请稍后重试/i);
});

test("home page renders the dashboard shell in English after sign-in", async () => {
  const home = await read("apps/web/src/app/page.tsx");

  assert.match(home, /DashboardHero/i);
  assert.match(home, /DashboardKpiGrid/i);
  assert.match(home, /DashboardQuickActions/i);
  assert.match(home, /RecentReviewRuns/i);
  assert.match(home, /RepositoryHealthList/i);
  assert.match(home, /RiskInsights/i);
  assert.doesNotMatch(home, /退出登录/i);
});
