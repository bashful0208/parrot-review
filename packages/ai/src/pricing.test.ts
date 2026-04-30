import { test } from "node:test";
import assert from "node:assert/strict";

import { estimateCost, MODEL_PRICES } from "./pricing.js";

test("estimateCost: known model with both token counts", () => {
  // claude-opus-4-7: 0.015/1k input, 0.075/1k output
  // 1000 input + 500 output = 1*0.015 + 0.5*0.075 = 0.0525
  const cost = estimateCost("claude-opus-4-7", 1000, 500);
  assert.ok(cost !== null);
  assert.ok(Math.abs((cost as number) - 0.0525) < 1e-9, `got ${cost}`);
});

test("estimateCost: known model, zero output tokens", () => {
  const cost = estimateCost("claude-opus-4-7", 1000, 0);
  assert.ok(cost !== null);
  assert.ok(Math.abs((cost as number) - 0.015) < 1e-9, `got ${cost}`);
});

test("estimateCost: unknown model returns null", () => {
  assert.equal(estimateCost("totally-fake-model-xyz", 1000, 500), null);
});

test("estimateCost: null token counts return null", () => {
  assert.equal(estimateCost("claude-opus-4-7", null, 500), null);
  assert.equal(estimateCost("claude-opus-4-7", 1000, null), null);
  assert.equal(estimateCost("claude-opus-4-7", null, null), null);
});

test("estimateCost: negative tokens return null (defensive)", () => {
  assert.equal(estimateCost("claude-opus-4-7", -1, 500), null);
  assert.equal(estimateCost("claude-opus-4-7", 1000, -1), null);
});

test("MODEL_PRICES: contains at least one known Claude model", () => {
  const opus = MODEL_PRICES["claude-opus-4-7"];
  assert.ok(opus);
  assert.ok(typeof opus.inputPer1k === "number");
  assert.ok(typeof opus.outputPer1k === "number");
});
