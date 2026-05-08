import test from "node:test";
import assert from "node:assert/strict";

import { buildDashboardViewModel, type BuildDashboardInput } from "./view-model";

function makeInput(overrides: Partial<BuildDashboardInput> = {}): BuildDashboardInput {
  return {
    user: { id: "user_123", email: "sasha@example.com", name: "Sasha" },
    orgName: "Acme Engineering",
    repoCount: 12,
    reviewRunCount: 48,
    openFindingsCount: 19,
    successRate: 96,
    repoHealthRows: [
      { id: "repo_1", name: "reviewer/web", status: "active", openFindings: 7, lastReviewAt: new Date(Date.now() - 22 * 60_000) },
      { id: "repo_2", name: "reviewer/core", status: "active", openFindings: 5, lastReviewAt: new Date(Date.now() - 58 * 60_000) },
      { id: "repo_3", name: "reviewer/worker", status: "active", openFindings: 7, lastReviewAt: null },
    ],
    usageSummary: {
      totalCalls: 1000,
      successCalls: 950,
      failedCalls: 40,
      truncatedCalls: 10,
      totalInputTokens: 500_000,
      totalOutputTokens: 200_000,
      totalCostUsd: 15.5,
      avgLatencyMs: 320,
      p95LatencyMs: 800,
    },
    usageDaily: [
      { day: "2026-05-01", calls: 120, costUsd: 1.8, inputTokens: 60000, outputTokens: 24000 },
      { day: "2026-05-02", calls: 145, costUsd: 2.1, inputTokens: 72000, outputTokens: 29000 },
      { day: "2026-05-03", calls: 110, costUsd: 1.6, inputTokens: 55000, outputTokens: 22000 },
    ],
    ...overrides,
  };
}

test("buildDashboardViewModel returns org-scoped hero and KPI content", () => {
  const model = buildDashboardViewModel(makeInput());

  assert.equal(model.hero.organizationName, "Acme Engineering");
  assert.match(model.hero.title, /workspace/i);
  assert.equal(model.kpis.length, 4);
  assert.equal(model.kpis[0]!.label, "Active Repositories");
});

test("buildDashboardViewModel falls back to email prefix when name is missing", () => {
  const model = buildDashboardViewModel(
    makeInput({ user: { id: "user_456", email: "no-name@example.com" } })
  );

  assert.equal(model.hero.viewerName, "no-name");
});

test("buildDashboardViewModel exposes stable recent runs and repositories", () => {
  const model = buildDashboardViewModel(makeInput());

  assert.ok(model.recentRuns.length >= 3);
  assert.ok(model.repositories.length >= 3);
});

test("buildDashboardViewModel includes admin shell navigation and topbar content", () => {
  const model = buildDashboardViewModel(makeInput());

  assert.equal(model.shell.currentPath, "/");
  assert.deepEqual(model.shell.navigation, [
    { label: "Overview", href: "/", icon: "overview" },
    {
      label: "Repositories",
      href: "/repositories",
      icon: "repositories",
    },
    { label: "Review Runs", href: "/review-runs", icon: "runs" },
    { label: "Usage", href: "/usage", icon: "usage" },
    { label: "Webhooks", href: "/webhooks", icon: "webhooks" },
    { label: "Settings", href: "/settings/providers", icon: "settings" },
  ]);
  assert.equal(model.topbar.title, "Overview");
  assert.equal(model.topbar.summary, "");
});

test("buildDashboardViewModel includes usage overview", () => {
  const model = buildDashboardViewModel(makeInput());

  assert.equal(model.usage.totalCalls, 1000);
  assert.equal(model.usage.avgLatencyMs, 320);
  assert.equal(model.usage.dailyPoints.length, 3);
  assert.equal(model.usage.dailyPoints[0]!.label, "May 1");
  assert.equal(model.usage.dailyPoints[0]!.value, 120);
});

test("buildDashboardViewModel returns fresh collections for each call", () => {
  const input = makeInput();
  const firstModel = buildDashboardViewModel(input);

  firstModel.shell.navigation[0]!.label = "Mutated";
  firstModel.kpis[0]!.value = "0";
  firstModel.recentRuns[0]!.title = "Changed run";
  firstModel.repositories[0]!.name = "mutated/repo";

  const secondModel = buildDashboardViewModel(input);

  assert.equal(secondModel.shell.navigation[0]?.label, "Overview");
  assert.equal(secondModel.kpis[0]?.value, "12");
  assert.equal(secondModel.recentRuns[0]?.title, "Unify dashboard auth gate");
  assert.equal(secondModel.repositories[0]?.name, "reviewer/web");
});
