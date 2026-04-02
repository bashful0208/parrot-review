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

test("buildDashboardViewModel exposes stable quick actions and recent runs", () => {
  const model = buildDashboardViewModel(authenticatedUser);

  assert.deepEqual(
    model.quickActions.map((action) => action.label),
    ["New Review", "Connect Repository", "View All Runs"]
  );
  assert.ok(model.recentRuns.length >= 3);
  assert.ok(model.repositories.length >= 3);
});
