import { test } from "node:test";
import assert from "node:assert/strict";

import { computeDiffPosition } from "./diff-position.js";

test("computeDiffPosition: returns null for null/empty patch", () => {
  assert.equal(computeDiffPosition(null, 10, "RIGHT"), null);
  assert.equal(computeDiffPosition("", 10, "RIGHT"), null);
});

test("computeDiffPosition: single hunk, added line on RIGHT", () => {
  const patch = [
    "@@ -10,3 +10,4 @@",
    " line10",
    " line11",
    "+added12",
    " line13",
  ].join("\n");
  // file line 12 on RIGHT is the "+added12" line
  // position counting (excluding first @@):
  //   " line10" -> 1
  //   " line11" -> 2
  //   "+added12" -> 3
  assert.equal(computeDiffPosition(patch, 12, "RIGHT"), 3);
});

test("computeDiffPosition: single hunk, context line on RIGHT", () => {
  const patch = [
    "@@ -10,3 +10,4 @@",
    " line10",
    " line11",
    "+added12",
    " line13",
  ].join("\n");
  // RIGHT line 13 is the trailing " line13" (position 4)
  assert.equal(computeDiffPosition(patch, 13, "RIGHT"), 4);
});

test("computeDiffPosition: single hunk, removed line on LEFT", () => {
  const patch = [
    "@@ -10,3 +10,2 @@",
    " line10",
    "-old11",
    " line12",
  ].join("\n");
  // LEFT line 11 is "-old11" -> position 2
  assert.equal(computeDiffPosition(patch, 11, "LEFT"), 2);
});

test("computeDiffPosition: multi-hunk, line in second hunk on RIGHT", () => {
  const patch = [
    "@@ -10,2 +10,3 @@",
    " a",
    "+b",
    " c",
    "@@ -50,2 +51,3 @@",
    " x",
    "+y",
    " z",
  ].join("\n");
  // Position counting:
  //   first @@ -> not counted
  //   " a" -> 1
  //   "+b" -> 2
  //   " c" -> 3
  //   second "@@" -> 4
  //   " x" -> 5
  //   "+y" -> 6
  //   " z" -> 7
  // RIGHT side line numbers: a=10, b=11, c=12, x=51, y=52, z=53
  assert.equal(computeDiffPosition(patch, 52, "RIGHT"), 6);
});

test("computeDiffPosition: returns null when file line not in patch", () => {
  const patch = [
    "@@ -10,2 +10,3 @@",
    " a",
    "+b",
    " c",
  ].join("\n");
  assert.equal(computeDiffPosition(patch, 999, "RIGHT"), null);
});

test("computeDiffPosition: handles single-line hunk header (no count)", () => {
  // unified diff allows omitting ",N" when count is 1
  const patch = [
    "@@ -5 +5,2 @@",
    " a",
    "+b",
  ].join("\n");
  // RIGHT line 5 = " a" -> position 1
  // RIGHT line 6 = "+b" -> position 2
  assert.equal(computeDiffPosition(patch, 6, "RIGHT"), 2);
});
