import test from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";

import DashboardHero from "./DashboardHero";
import RecentReviewRuns from "./RecentReviewRuns";
import RepositoryHealthList from "./RepositoryHealthList";
import RepositoryList from "../repositories/RepositoryList";
import { buildDashboardViewModel } from "@/lib/dashboard/view-model";

const model = buildDashboardViewModel({
  id: "user_123",
  email: "sasha@example.com",
  name: "Sasha",
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
