import test from "node:test";
import assert from "node:assert/strict";

import { buildDashboardViewModel } from "./view-model";

const authenticatedUser = {
  id: "user_123",
  email: "sasha@example.com",
  name: "Sasha",
};

test("buildDashboardViewModel returns org-scoped hero and KPI content", () => {
  const model = buildDashboardViewModel(authenticatedUser);

  assert.equal(model.hero.organizationName, "Acme Engineering");
  assert.match(model.hero.title, /workspace/i);
  assert.equal(model.kpis.length, 4);
});

test("buildDashboardViewModel falls back to email prefix when name is missing", () => {
  const model = buildDashboardViewModel({
    id: "user_456",
    email: "no-name@example.com",
  });

  assert.equal(model.hero.viewerName, "no-name");
});

test("buildDashboardViewModel exposes stable recent runs and repositories", () => {
  const model = buildDashboardViewModel(authenticatedUser);

  assert.ok(model.recentRuns.length >= 3);
  assert.ok(model.repositories.length >= 3);
});

test("buildDashboardViewModel includes admin shell navigation and topbar content", () => {
  const model = buildDashboardViewModel(authenticatedUser);

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

test("buildDashboardViewModel returns fresh collections for each call", () => {
  const firstModel = buildDashboardViewModel(authenticatedUser);

  firstModel.shell.navigation[0]!.label = "Mutated";
  firstModel.kpis[0]!.value = "0";
  firstModel.recentRuns[0]!.title = "Changed run";
  firstModel.repositories[0]!.name = "mutated/repo";

  const secondModel = buildDashboardViewModel(authenticatedUser);

  assert.equal(secondModel.shell.navigation[0]?.label, "Overview");
  assert.equal(secondModel.kpis[0]?.value, "12");
  assert.equal(secondModel.recentRuns[0]?.title, "Unify dashboard auth gate");
  assert.equal(secondModel.repositories[0]?.name, "reviewer/web");
});
