import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { withRetry } from "./errors.js";

describe("withRetry", () => {
  it("returns result on first success", async () => {
    let calls = 0;
    const result = await withRetry(async () => {
      calls++;
      return "ok";
    });
    assert.equal(result, "ok");
    assert.equal(calls, 1);
  });

  it("retries on retryable error and succeeds", async () => {
    let calls = 0;
    const result = await withRetry(
      async () => {
        calls++;
        if (calls < 3) {
          const err = new Error("socket hang up");
          (err as any).code = "ECONNRESET";
          throw err;
        }
        return "ok";
      },
      { maxAttempts: 3, baseDelayMs: 1, maxDelayMs: 10 }
    );
    assert.equal(result, "ok");
    assert.equal(calls, 3);
  });

  it("throws after maxAttempts exhausted", async () => {
    let calls = 0;
    await assert.rejects(
      () =>
        withRetry(
          async () => {
            calls++;
            const err = new Error("socket hang up");
            (err as any).code = "ECONNRESET";
            throw err;
          },
          { maxAttempts: 3, baseDelayMs: 1, maxDelayMs: 10 }
        ),
      { code: "ECONNRESET" }
    );
    assert.equal(calls, 3);
  });

  it("does not retry non-retryable errors", async () => {
    let calls = 0;
    await assert.rejects(
      () =>
        withRetry(
          async () => {
            calls++;
            const err = new Error("unauthorized");
            (err as any).status = 401;
            throw err;
          },
          { maxAttempts: 3, baseDelayMs: 1, maxDelayMs: 10 }
        ),
      { message: "unauthorized" }
    );
    assert.equal(calls, 1);
  });

  it("retries on 502/503/504 status", async () => {
    let calls = 0;
    const result = await withRetry(
      async () => {
        calls++;
        if (calls < 2) {
          const err = new Error("Bad Gateway");
          (err as any).status = 502;
          throw err;
        }
        return "ok";
      },
      { maxAttempts: 3, baseDelayMs: 1, maxDelayMs: 10 }
    );
    assert.equal(result, "ok");
    assert.equal(calls, 2);
  });

  it("accepts custom isRetryable", async () => {
    let calls = 0;
    await assert.rejects(
      () =>
        withRetry(
          async () => {
            calls++;
            throw new Error("custom");
          },
          {
            maxAttempts: 3,
            baseDelayMs: 1,
            maxDelayMs: 10,
            isRetryable: () => false,
          }
        ),
      { message: "custom" }
    );
    assert.equal(calls, 1);
  });
});
