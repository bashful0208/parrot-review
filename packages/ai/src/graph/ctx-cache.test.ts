import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";

import { setCtx, getCtx, clearCtx, type ReviewCtxCacheEntry } from "./ctx-cache.js";

const blank: ReviewCtxCacheEntry = { diffs: [], guidelines: "g", projectContext: "p" };

describe("ctx-cache", () => {
  beforeEach(() => clearCtx("rr-1"));

  it("set then get returns the same object", () => {
    setCtx("rr-1", blank);
    const c = getCtx("rr-1");
    assert.equal(c?.guidelines, "g");
    assert.equal(c?.projectContext, "p");
  });

  it("clear removes the entry", () => {
    setCtx("rr-1", blank);
    clearCtx("rr-1");
    assert.equal(getCtx("rr-1"), undefined);
  });

  it("missing key returns undefined", () => {
    assert.equal(getCtx("nope"), undefined);
  });

  it("multiple keys do not interfere", () => {
    setCtx("rr-a", { ...blank, guidelines: "A" });
    setCtx("rr-b", { ...blank, guidelines: "B" });
    assert.equal(getCtx("rr-a")?.guidelines, "A");
    assert.equal(getCtx("rr-b")?.guidelines, "B");
    clearCtx("rr-a");
    clearCtx("rr-b");
  });
});
