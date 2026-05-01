import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  ReviewGraphState,
  appendArrayReducer,
  overwriteReducer,
  mergeMapReducer,
} from "./state.js";

describe("ReviewGraphState reducers", () => {
  it("appendArrayReducer concatenates", () => {
    assert.deepEqual(appendArrayReducer([1, 2], [3, 4]), [1, 2, 3, 4]);
  });

  it("appendArrayReducer empty + value", () => {
    assert.deepEqual(appendArrayReducer<number>([], [1]), [1]);
  });

  it("overwriteReducer returns right side", () => {
    assert.deepEqual(overwriteReducer([1], [2]), [2]);
    assert.equal(overwriteReducer("a", "b"), "b");
    assert.equal(overwriteReducer(null as unknown as string, "x"), "x");
  });

  it("mergeMapReducer right wins on conflict", () => {
    const merged = mergeMapReducer(
      { k1: { v: 1 }, k2: { v: 2 } },
      { k2: { v: 99 }, k3: { v: 3 } }
    );
    assert.deepEqual(merged, {
      k1: { v: 1 },
      k2: { v: 99 },
      k3: { v: 3 },
    });
  });

  it("mergeMapReducer empty + value", () => {
    assert.deepEqual(mergeMapReducer<number>({}, { a: 1 }), { a: 1 });
  });
});

describe("ReviewGraphState shape", () => {
  it("Annotation.Root exposes a State type and is constructable", () => {
    // Smoke check: 拿到 Annotation 实例不报错；细节走 graph integration test 验证
    assert.ok(ReviewGraphState);
  });
});
