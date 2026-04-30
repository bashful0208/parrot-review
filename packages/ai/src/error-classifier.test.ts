import { test } from "node:test";
import assert from "node:assert/strict";

import { classifyAiError } from "./error-classifier.js";

test("classifyAiError: HTTP 429 status -> rate_limit", () => {
  assert.equal(classifyAiError({ status: 429, message: "rate limited" }), "rate_limit");
});

test("classifyAiError: HTTP 401 -> auth", () => {
  assert.equal(classifyAiError({ status: 401 }), "auth");
});

test("classifyAiError: HTTP 403 -> auth", () => {
  assert.equal(classifyAiError({ status: 403 }), "auth");
});

test("classifyAiError: HTTP 402 -> quota", () => {
  assert.equal(classifyAiError({ status: 402 }), "quota");
});

test("classifyAiError: HTTP 400 -> bad_request", () => {
  assert.equal(classifyAiError({ status: 400 }), "bad_request");
});

test("classifyAiError: 5xx -> server_error", () => {
  assert.equal(classifyAiError({ status: 500 }), "server_error");
  assert.equal(classifyAiError({ status: 503 }), "server_error");
});

test("classifyAiError: timeout keyword -> timeout", () => {
  assert.equal(classifyAiError(new Error("Request timed out after 30s")), "timeout");
  assert.equal(classifyAiError(new Error("ETIMEDOUT")), "timeout");
});

test("classifyAiError: network code -> network", () => {
  const err = Object.assign(new Error("connect ECONNREFUSED"), {
    code: "ECONNREFUSED",
  });
  assert.equal(classifyAiError(err), "network");
});

test("classifyAiError: ENOTFOUND -> network", () => {
  const err = Object.assign(new Error("getaddrinfo ENOTFOUND api.example.com"), {
    code: "ENOTFOUND",
  });
  assert.equal(classifyAiError(err), "network");
});

test("classifyAiError: JSON parse error -> parse_error", () => {
  let err: unknown;
  try {
    JSON.parse("not json");
  } catch (e) {
    err = e;
  }
  assert.equal(classifyAiError(err), "parse_error");
});

test("classifyAiError: our schema validation message -> validation_error", () => {
  assert.equal(
    classifyAiError(new Error("Tool input: 'findings' must be an array")),
    "validation_error"
  );
  assert.equal(
    classifyAiError(new Error("did not return expected tool_use block")),
    "validation_error"
  );
});

test("classifyAiError: rate limit keyword without status -> rate_limit", () => {
  assert.equal(
    classifyAiError(new Error("You have been rate limited")),
    "rate_limit"
  );
});

test("classifyAiError: unknown shape -> unknown", () => {
  assert.equal(classifyAiError(new Error("Something weird")), "unknown");
  assert.equal(classifyAiError("a string"), "unknown");
  assert.equal(classifyAiError(null), "unknown");
  assert.equal(classifyAiError(undefined), "unknown");
  assert.equal(classifyAiError({}), "unknown");
});

test("classifyAiError: status takes precedence over message", () => {
  // status=429 should win over message keyword
  assert.equal(
    classifyAiError({ status: 429, message: "ETIMEDOUT something" }),
    "rate_limit"
  );
});
