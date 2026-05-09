import test from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";

import DashboardHero from "./DashboardHero";
import RecentReviewRuns from "./RecentReviewRuns";
import RepositoryHealthList from "./RepositoryHealthList";
import RepositoryList from "../repositories/RepositoryList";
import { buildDashboardViewModel } from "@/lib/dashboard/view-model";

const model = buildDashboardViewModel({
  user: { id: "user_123", email: "sasha@example.com", name: "Sasha" },
  orgName: "Acme Engineering",
  repoCount: 12,
  reviewRunCount: 48,
  openFindingsCount: 19,
  successRate: 96,
  repoHealthRows: [
    { id: "repo_1", name: "reviewer/web", status: "active", openFindings: 7, lastReviewAt: new Date() },
    { id: "repo_2", name: "reviewer/core", status: "active", openFindings: 5, lastReviewAt: new Date() },
    { id: "repo_3", name: "reviewer/worker", status: "active", openFindings: 7, lastReviewAt: null },
  ],
  usageSummary: {
    totalCalls: 1000, successCalls: 950, failedCalls: 40, truncatedCalls: 10,
    totalInputTokens: 500_000, totalOutputTokens: 200_000, totalCostUsd: 15.5,
    avgLatencyMs: 320, p95LatencyMs: 800,
  },
  usageDaily: [],
});

test("dashboard hero renders organization context", () => {
  const markup = renderToStaticMarkup(<DashboardHero hero={model.hero} />);

  assert.match(markup, /Acme Engineering/);
  assert.match(markup, /Sasha/);
});

test("activity modules render review content", () => {
  const runsMarkup = renderToStaticMarkup(
    <RecentReviewRuns runs={model.recentRuns} />
  );
  const repositoryMarkup = renderToStaticMarkup(
    <RepositoryHealthList repositories={model.repositories} />
  );

  assert.match(runsMarkup, /PR #184/);
  assert.match(repositoryMarkup, /reviewer\/web/);
});

test("recent review runs shows an empty state when no runs exist", () => {
  const markup = renderToStaticMarkup(<RecentReviewRuns runs={[]} />);

  assert.match(markup, /Start your first review/);
});

test("repository health shows a connect CTA when no repositories exist", () => {
  const markup = renderToStaticMarkup(
    <RepositoryHealthList repositories={[]} />
  );

  assert.match(markup, /Connect Repository/);
});

test("repository list renders card grid with repo names", () => {
  const repos = [
    {
      id: "r1",
      name: "frontend",
      fullName: "acme/frontend",
      provider: "github",
      status: "active",
      createdAtLabel: "Connected Apr 1, 2026",
    },
    {
      id: "r2",
      name: "backend",
      fullName: "acme/backend",
      provider: "github",
      status: "disabled",
      createdAtLabel: "Connected Mar 1, 2026",
    },
  ];
  const markup = renderToStaticMarkup(<RepositoryList repositories={repos} />);

  assert.match(markup, /acme\/frontend/);
  assert.match(markup, /acme\/backend/);
  assert.match(markup, /Connect Repository/);
});
