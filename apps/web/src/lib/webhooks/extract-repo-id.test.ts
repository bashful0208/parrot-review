import test from "node:test";
import assert from "node:assert/strict";

import { extractProviderRepoId } from "./extract-repo-id";

test("extractProviderRepoId: numeric id is stringified", () => {
  assert.equal(extractProviderRepoId(JSON.stringify({ repository: { id: 9001 } })), "9001");
});

test("extractProviderRepoId: string id passes through", () => {
  assert.equal(extractProviderRepoId(JSON.stringify({ repository: { id: "abc" } })), "abc");
});

test("extractProviderRepoId: missing repository returns undefined", () => {
  assert.equal(extractProviderRepoId(JSON.stringify({})), undefined);
});

test("extractProviderRepoId: missing id returns undefined", () => {
  assert.equal(extractProviderRepoId(JSON.stringify({ repository: {} })), undefined);
});

test("extractProviderRepoId: invalid JSON returns undefined", () => {
  assert.equal(extractProviderRepoId("not json"), undefined);
});

test("extractProviderRepoId: empty string returns undefined", () => {
  assert.equal(extractProviderRepoId(""), undefined);
});
