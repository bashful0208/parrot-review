import test from "node:test";
import assert from "node:assert/strict";

import { buildRepositoryDetailViewModel } from "./detail-view-model";
import type { RepositoryDetailRow } from "@reviewer/core";

const baseRow: RepositoryDetailRow = {
  id: "repo-uuid-1",
  name: "my-repo",
  full_name: "myorg/my-repo",
  provider: "github",
  default_branch: "main",
  status: "active",
  created_at: new Date("2026-04-04T10:00:00Z"),
  webhook_secret: "abc123secret",
};

test("buildRepositoryDetailViewModel maps all fields", () => {
  const vm = buildRepositoryDetailViewModel(
    baseRow,
    "https://app.example.com/api/webhooks/github"
  );

  assert.equal(vm.id, "repo-uuid-1");
  assert.equal(vm.fullName, "myorg/my-repo");
  assert.equal(vm.provider, "github");
  assert.equal(vm.defaultBranch, "main");
  assert.equal(vm.status, "active");
  assert.equal(vm.webhookSecret, "abc123secret");
  assert.equal(vm.webhookUrl, "https://app.example.com/api/webhooks/github");
  assert.equal(vm.createdAtLabel, "2026-04-04");
});

test("buildRepositoryDetailViewModel formats date as YYYY-MM-DD", () => {
  const vm = buildRepositoryDetailViewModel(
    { ...baseRow, created_at: new Date("2025-12-01T00:00:00Z") },
    ""
  );
  assert.equal(vm.createdAtLabel, "2025-12-01");
});
