import { test } from "node:test";
import assert from "node:assert/strict";

import {
  buildWebhookDetailViewModel,
  buildWebhooksListViewModel,
} from "./view-model";

const baseUser = { id: "u-1", email: "u@example.com", name: "Alice" };

const baseStats = {
  total: 0,
  signatureInvalid: 0,
  byProvider: {} as Record<string, number>,
  topEventTypes: [] as Array<{ eventType: string; count: number }>,
};

test("buildWebhooksListViewModel: KPI cards reflect stats", () => {
  const vm = buildWebhooksListViewModel({
    user: baseUser,
    stats: {
      total: 42,
      signatureInvalid: 2,
      byProvider: { github: 30, gitee: 12 },
      topEventTypes: [{ eventType: "pull_request", count: 18 }],
    },
    events: [],
    totalCount: 42,
    rangeDays: 1,
    provider: null,
    page: 1,
    perPage: 50,
  });
  assert.equal(vm.kpis[0]!.value, "42");
  assert.equal(vm.kpis[1]!.value, "2");
  assert.equal(vm.kpis[1]!.tone, "warn");
  assert.equal(vm.kpis[2]!.value, "30 / 12");
  assert.equal(vm.kpis[3]!.value, "pull_request");
});

test("buildWebhooksListViewModel: empty state -> hasData=false", () => {
  const vm = buildWebhooksListViewModel({
    user: baseUser,
    stats: baseStats,
    events: [],
    totalCount: 0,
    rangeDays: 1,
    provider: null,
    page: 1,
    perPage: 50,
  });
  assert.equal(vm.hasData, false);
  assert.equal(vm.pagination.rangeLabel, "No events");
  assert.equal(vm.pagination.prevHref, null);
  assert.equal(vm.pagination.nextHref, null);
});

test("buildWebhooksListViewModel: pagination text and href math", () => {
  const vm = buildWebhooksListViewModel({
    user: baseUser,
    stats: { ...baseStats, total: 137 },
    events: [],
    totalCount: 137,
    rangeDays: 7,
    provider: "github",
    page: 2,
    perPage: 50,
  });
  assert.equal(vm.pagination.rangeLabel, "Showing 51–100 of 137");
  // prev should go back to page 1, keep range=7d & provider=github
  assert.equal(vm.pagination.prevHref, "/webhooks?range=7d&provider=github");
  // next should go to page 3
  assert.equal(
    vm.pagination.nextHref,
    "/webhooks?range=7d&provider=github&page=3"
  );
});

test("buildWebhooksListViewModel: last page -> nextHref null", () => {
  const vm = buildWebhooksListViewModel({
    user: baseUser,
    stats: { ...baseStats, total: 137 },
    events: [],
    totalCount: 137,
    rangeDays: 1,
    provider: null,
    page: 3,
    perPage: 50,
  });
  assert.equal(vm.pagination.rangeLabel, "Showing 101–137 of 137");
  assert.equal(vm.pagination.nextHref, null);
});

test("buildWebhooksListViewModel: range and provider tabs reflect active state", () => {
  const vm = buildWebhooksListViewModel({
    user: baseUser,
    stats: baseStats,
    events: [],
    totalCount: 0,
    rangeDays: 7,
    provider: "gitee",
    page: 1,
    perPage: 50,
  });
  const activeRanges = vm.filters.rangeOptions.filter((o) => o.active);
  assert.equal(activeRanges.length, 1);
  assert.equal(activeRanges[0]!.key, "7d");

  const activeProviders = vm.filters.providerOptions.filter((o) => o.active);
  assert.equal(activeProviders.length, 1);
  assert.equal(activeProviders[0]!.key, "gitee");
});

test("buildWebhooksListViewModel: row mapping shortens delivery id and labels signature", () => {
  const now = new Date("2026-04-30T12:00:00Z");
  const vm = buildWebhooksListViewModel({
    user: baseUser,
    stats: { ...baseStats, total: 1 },
    events: [
      {
        id: "evt-1",
        organizationId: "org-1",
        repositoryId: "repo-1",
        repositoryFullName: "acme/api",
        provider: "github",
        eventType: "pull_request",
        deliveryId: "abcdef0123456789-very-long-id",
        signatureValid: false,
        status: "received",
        errorMessage: null,
        processedAt: null,
        payloadHash: "x",
        payloadSizeBytes: 2048,
        createdAt: new Date("2026-04-30T11:55:00Z"),
      },
    ],
    totalCount: 1,
    rangeDays: 1,
    provider: null,
    page: 1,
    perPage: 50,
    now,
  });
  const r = vm.rows[0]!;
  assert.equal(r.signatureLabel, "invalid");
  assert.equal(r.deliveryIdShort, "abcdef012345…");
  assert.equal(r.repositoryFullName, "acme/api");
  assert.equal(r.payloadSizeLabel, "2.0 KB");
  assert.equal(r.detailHref, "/webhooks/evt-1");
  assert.equal(r.occurredAtLabel, "5m ago");
});

test("buildWebhookDetailViewModel: payload pretty-printed and meta has key fields", () => {
  const vm = buildWebhookDetailViewModel({
    user: baseUser,
    detail: {
      id: "evt-1",
      organizationId: "org-1",
      repositoryId: null,
      repositoryFullName: null,
      provider: "github",
      eventType: "pull_request",
      deliveryId: "delivery-1",
      signatureValid: true,
      status: "received",
      errorMessage: null,
      processedAt: null,
      payloadHash: "deadbeef",
      payloadSizeBytes: 5,
      payload: { hello: "world" },
      createdAt: new Date("2026-04-30T12:00:00Z"),
    },
  });
  assert.match(vm.payloadJson, /"hello": "world"/);
  const labels = vm.meta.map((m) => m.label);
  assert.ok(labels.includes("Provider"));
  assert.ok(labels.includes("Delivery ID"));
  assert.ok(labels.includes("Payload sha256"));
  // processed_at NULL renders as "—"
  const processed = vm.meta.find((m) => m.label === "Processed at");
  assert.equal(processed!.value, "—");
});
