# OpenAI 兼容 Adapter 的 tool_choice 兼容性修复 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 `OpenAICompatibleAdapter` 兼容阿里 DashScope thinking 模型，同时保持标准 OpenAI 行为。

**Architecture:** 把 `tool_choice` 从 object 改成 `"auto"`，并新增一个文本 JSON 提取 fallback：当模型未返回 tool_call 时，从 `message.content` 文本中抽 JSON 兜底。

**Tech Stack:** TypeScript（packages/ai），`openai` SDK，`node:test` + `node:assert/strict`，pnpm 工作区。

参考 spec：`docs/superpowers/specs/2026-04-29-openai-compat-tool-choice-fallback-design.md`

---

## File Structure

修改的文件：

- `packages/ai/package.json` —— 增加 `test` script，让现有 / 新增 reference 测试实际跑起来（不加这个步骤，TDD 失去意义，因为 root `pnpm test` 用 `pnpm -r --if-present run test`，`packages/ai` 当前没有 test script）
- `packages/ai/src/adapter.ts` —— 主改动：新增 `extractJsonFromText` helper、把 `OpenAICompatibleAdapter` 两个方法的 `tool_choice` 改成 `"auto"`、解析路径加 fallback
- `packages/ai/src/review.test.mjs` —— 增加 reference-style 测试，与该文件现有约定一致（inline reference impl + 断言契约）

不动的文件：`packages/ai/src/config.ts`、`packages/ai/src/types.ts`、`packages/ai/src/review.ts`、`AnthropicAdapter`、调用方。

---

## Task 1: 给 packages/ai 加上 test script，让测试能跑

**Files:**
- Modify: `packages/ai/package.json`

- [ ] **Step 1: 编辑 package.json，给 scripts 加 test**

把 `packages/ai/package.json` 的 `scripts` 段从：

```json
"scripts": {
  "lint": "pnpm --dir ../.. exec eslint .",
  "typecheck": "tsc --noEmit -p tsconfig.json"
},
```

改成：

```json
"scripts": {
  "lint": "pnpm --dir ../.. exec eslint .",
  "typecheck": "tsc --noEmit -p tsconfig.json",
  "test": "node --test src/*.test.mjs"
},
```

- [ ] **Step 2: 验证现有测试在新 script 下通过**

Run（在仓库根目录）：

```bash
pnpm --filter @reviewer/ai run test
```

Expected：现有 `review.test.mjs` 全部通过（buildDiffText / validateFindings / toolUseBlock missing / max_tokens / log helper 等用例），无 fail。

- [ ] **Step 3: 提交**

```bash
git add packages/ai/package.json
git commit -m "$(cat <<'EOF'
chore: enable node:test runner for @reviewer/ai / 让 ai 包跑现有 reference 测试

之前 packages/ai 没有 test script，根目录 pnpm test 用 -r --if-present
就会跳过它。加上 node --test src/*.test.mjs，让现有 review.test.mjs
和后续 fallback 测试都能在 CI/本地实际执行。
EOF
)"
```

---

## Task 2: TDD - 写 `extractJsonFromText` helper 的契约测试（先失败）

**Files:**
- Modify: `packages/ai/src/review.test.mjs`

> 注：本文件采用 reference-impl 模式（inline 一份参考实现，断言其契约；实际 TS 实现必须匹配同样契约）。下面的步骤遵循同一约定。

- [ ] **Step 1: 在 review.test.mjs 末尾追加 extractJsonFromText 的 reference 实现 + 契约测试**

在文件末尾追加以下内容：

```javascript
// ---------------------------------------------------------------------------
// 6. extractJsonFromText: 从文本里抽 JSON 的 fallback 解析
// ---------------------------------------------------------------------------

// Reference implementation. The actual TypeScript implementation in
// packages/ai/src/adapter.ts MUST satisfy the contract asserted below.
function extractJsonFromText_reference(text) {
  if (typeof text !== "string" || text.trim() === "") return undefined;

  // 1) 整段直接 parse
  try {
    return JSON.parse(text);
  } catch {
    /* fall through */
  }

  // 2) 取第一个 ```json ... ``` 或 ``` ... ``` 代码块
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence && fence[1]) {
    try {
      return JSON.parse(fence[1].trim());
    } catch {
      /* fall through */
    }
  }

  // 3) 第一个 { 到最后一个 } 之间
  const first = text.indexOf("{");
  const last = text.lastIndexOf("}");
  if (first !== -1 && last > first) {
    try {
      return JSON.parse(text.slice(first, last + 1));
    } catch {
      /* fall through */
    }
  }

  return undefined;
}

test("extractJsonFromText: bare JSON parses directly", () => {
  const result = extractJsonFromText_reference('{"findings":[]}');
  assert.deepEqual(result, { findings: [] });
});

test("extractJsonFromText: ```json fenced block", () => {
  const text = 'Here is the data:\n```json\n{"findings":[{"x":1}]}\n```\nDone.';
  const result = extractJsonFromText_reference(text);
  assert.deepEqual(result, { findings: [{ x: 1 }] });
});

test("extractJsonFromText: plain ``` fenced block", () => {
  const text = 'Output:\n```\n{"summaryMd":"hi","highlights":[]}\n```';
  const result = extractJsonFromText_reference(text);
  assert.deepEqual(result, { summaryMd: "hi", highlights: [] });
});

test("extractJsonFromText: first-{ to last-} when surrounded by prose", () => {
  const text = 'Some preamble. {"findings":[{"a":1}]} trailing words.';
  const result = extractJsonFromText_reference(text);
  assert.deepEqual(result, { findings: [{ a: 1 }] });
});

test("extractJsonFromText: nested objects survive first-{-to-last-} extraction", () => {
  const text = 'noise {"outer":{"inner":[1,2,3]}} more noise';
  const result = extractJsonFromText_reference(text);
  assert.deepEqual(result, { outer: { inner: [1, 2, 3] } });
});

test("extractJsonFromText: empty / null / non-string returns undefined", () => {
  assert.equal(extractJsonFromText_reference(undefined), undefined);
  assert.equal(extractJsonFromText_reference(null), undefined);
  assert.equal(extractJsonFromText_reference(""), undefined);
  assert.equal(extractJsonFromText_reference("   "), undefined);
});

test("extractJsonFromText: unparseable garbage returns undefined", () => {
  const result = extractJsonFromText_reference("just words, no json here");
  assert.equal(result, undefined);
});
```

- [ ] **Step 2: 跑测试，应该全部 PASS（reference 自洽）**

Run：

```bash
pnpm --filter @reviewer/ai run test
```

Expected：所有 7 个新增 case PASS。这一步的目的是验证我们写下来的契约本身是自洽的；真正的 TDD failing 测试在 Task 4 的实现集成测试里。

- [ ] **Step 3: 提交**

```bash
git add packages/ai/src/review.test.mjs
git commit -m "$(cat <<'EOF'
test: pin extractJsonFromText fallback contract / 钉死文本 JSON fallback 契约

为 OpenAI 兼容 adapter 即将引入的文本 JSON 抽取 fallback 写出参考实现
和契约用例，覆盖裸 JSON、```json fenced、plain fenced、first-{ 到 last-}、
空值与 garbage 等场景。后续 TS 实现必须满足同一契约。
EOF
)"
```

---

## Task 3: TDD - 写 OpenAI 兼容 adapter 解析路径的契约测试

**Files:**
- Modify: `packages/ai/src/review.test.mjs`

- [ ] **Step 1: 在 review.test.mjs 末尾追加解析路径 reference 实现 + 测试**

在文件末尾追加：

```javascript
// ---------------------------------------------------------------------------
// 7. OpenAI-compatible parsing path: tool_call + content-fallback
// ---------------------------------------------------------------------------

// Reference implementation of the parsing flow inside
// OpenAICompatibleAdapter.generateReviewFindings / generateReviewSummary.
// The actual TypeScript implementation MUST satisfy this contract.
function parseOpenAiCompatChoice_reference({ choice, toolName, validate }) {
  // 1) tool_call 优先
  const toolCall = choice?.message?.tool_calls?.[0];
  if (toolCall && toolCall.type === "function") {
    if (toolCall.function?.name !== toolName) {
      throw new Error(
        `OpenAI-compatible API did not return expected tool call for ${toolName}`
      );
    }
    let parsed;
    try {
      parsed = JSON.parse(toolCall.function.arguments);
    } catch {
      throw new Error(
        `Failed to parse ${toolName} arguments: ${toolCall.function.arguments}`
      );
    }
    return validate(parsed);
  }

  // 2) content fallback
  const content = choice?.message?.content;
  const fallback = extractJsonFromText_reference(
    typeof content === "string" ? content : undefined
  );
  if (fallback !== undefined) {
    return validate(fallback);
  }

  // 3) 都没有
  throw new Error(
    `OpenAI-compatible API did not return expected tool call for ${toolName}`
  );
}

const validateFindingsRef = (input) => {
  const findings = validateAndNormalizeFindings_reference(input);
  return { findings };
};

const validateSummaryRef = (input) => {
  if (typeof input !== "object" || input === null) {
    throw new Error("Tool input: report_summary expected an object");
  }
  const obj = input;
  if (typeof obj.summaryMd !== "string" || obj.summaryMd.trim() === "") {
    throw new Error("Tool input: 'summaryMd' must be a non-empty string");
  }
  if (!Array.isArray(obj.highlights)) {
    throw new Error("Tool input: 'highlights' must be an array");
  }
  return {
    summary: {
      summaryMd: obj.summaryMd,
      highlights: obj.highlights.filter(
        (h) => typeof h === "string" && h.trim() !== ""
      ),
    },
  };
};

test("parseOpenAiCompatChoice: tool_call path returns findings", () => {
  const finding = {
    filePath: "a.ts",
    startLine: 1,
    endLine: 2,
    side: "RIGHT",
    issueType: "quality",
    severity: "low",
    title: "T",
    summary: "S",
    suggestion: "Fix",
    confidenceScore: 0.5,
  };
  const choice = {
    message: {
      tool_calls: [
        {
          type: "function",
          function: {
            name: "report_findings",
            arguments: JSON.stringify({ findings: [finding] }),
          },
        },
      ],
      content: null,
    },
  };
  const result = parseOpenAiCompatChoice_reference({
    choice,
    toolName: "report_findings",
    validate: validateFindingsRef,
  });
  assert.equal(result.findings.length, 1);
  assert.equal(result.findings[0].filePath, "a.ts");
});

test("parseOpenAiCompatChoice: tool_call wrong name throws", () => {
  const choice = {
    message: {
      tool_calls: [
        {
          type: "function",
          function: { name: "something_else", arguments: "{}" },
        },
      ],
    },
  };
  assert.throws(
    () =>
      parseOpenAiCompatChoice_reference({
        choice,
        toolName: "report_findings",
        validate: validateFindingsRef,
      }),
    /did not return expected tool call/
  );
});

test("parseOpenAiCompatChoice: no tool_call but bare-JSON content -> fallback findings", () => {
  const finding = {
    filePath: "a.ts",
    startLine: 1,
    endLine: 2,
    side: "RIGHT",
    issueType: "quality",
    severity: "low",
    title: "T",
    summary: "S",
    suggestion: "Fix",
    confidenceScore: 0.7,
  };
  const choice = {
    message: {
      tool_calls: undefined,
      content: JSON.stringify({ findings: [finding] }),
    },
  };
  const result = parseOpenAiCompatChoice_reference({
    choice,
    toolName: "report_findings",
    validate: validateFindingsRef,
  });
  assert.equal(result.findings.length, 1);
});

test("parseOpenAiCompatChoice: no tool_call but fenced-JSON content -> fallback summary", () => {
  const choice = {
    message: {
      tool_calls: undefined,
      content:
        'Sure:\n```json\n{"summaryMd":"a PR summary","highlights":["fix bug"]}\n```',
    },
  };
  const result = parseOpenAiCompatChoice_reference({
    choice,
    toolName: "report_summary",
    validate: validateSummaryRef,
  });
  assert.equal(result.summary.summaryMd, "a PR summary");
  assert.deepEqual(result.summary.highlights, ["fix bug"]);
});

test("parseOpenAiCompatChoice: no tool_call and no parseable content throws", () => {
  const choice = {
    message: {
      tool_calls: undefined,
      content: "I think the code looks fine, no issues found.",
    },
  };
  assert.throws(
    () =>
      parseOpenAiCompatChoice_reference({
        choice,
        toolName: "report_findings",
        validate: validateFindingsRef,
      }),
    /did not return expected tool call/
  );
});

test("parseOpenAiCompatChoice: missing message entirely throws", () => {
  assert.throws(
    () =>
      parseOpenAiCompatChoice_reference({
        choice: { message: undefined },
        toolName: "report_findings",
        validate: validateFindingsRef,
      }),
    /did not return expected tool call/
  );
});
```

- [ ] **Step 2: 跑测试**

Run：

```bash
pnpm --filter @reviewer/ai run test
```

Expected：6 个新增 case 全部 PASS。

- [ ] **Step 3: 提交**

```bash
git add packages/ai/src/review.test.mjs
git commit -m "$(cat <<'EOF'
test: pin OpenAI-compat tool_call + content fallback parsing / 钉死解析契约

为即将上线的"无 tool_call 时回落到 message.content 解析"路径写出参考
实现和契约用例：tool_call 主路径、错工具名抛错、裸 JSON 与 fenced
fallback、garbage 抛错、空 message 抛错。
EOF
)"
```

---

## Task 4: 在 adapter.ts 实现 `extractJsonFromText` helper

**Files:**
- Modify: `packages/ai/src/adapter.ts`

- [ ] **Step 1: 在 Shared helpers 段（`SUMMARY_SYSTEM_PROMPT` 之后、`validateAndNormalizeSummary` 之前）插入 helper**

在 `packages/ai/src/adapter.ts` 中找到这一行：

```ts
const SUMMARY_SYSTEM_PROMPT =
  "You are a senior code reviewer summarizing a pull request for a teammate. Be accurate, specific, and concise. Describe what changed and why; flag noteworthy risks. Do not fabricate behavior that is not in the diff.";
```

在它**之后**、`function validateAndNormalizeSummary(...)` **之前**插入：

```ts
function extractJsonFromText(text: string | null | undefined): unknown | undefined {
  if (typeof text !== "string" || text.trim() === "") return undefined;

  try {
    return JSON.parse(text);
  } catch {
    /* fall through */
  }

  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence && fence[1]) {
    try {
      return JSON.parse(fence[1].trim());
    } catch {
      /* fall through */
    }
  }

  const first = text.indexOf("{");
  const last = text.lastIndexOf("}");
  if (first !== -1 && last > first) {
    try {
      return JSON.parse(text.slice(first, last + 1));
    } catch {
      /* fall through */
    }
  }

  return undefined;
}
```

- [ ] **Step 2: typecheck**

Run：

```bash
pnpm --filter @reviewer/ai run typecheck
```

Expected：通过，无 error。

- [ ] **Step 3: 跑测试**

Run：

```bash
pnpm --filter @reviewer/ai run test
```

Expected：之前的所有用例继续 PASS（这一步还没改变运行行为）。

- [ ] **Step 4: 暂不提交，等 Task 5 一起提**

---

## Task 5: `OpenAICompatibleAdapter` 改 `tool_choice` 为 `"auto"` 并接入 fallback

**Files:**
- Modify: `packages/ai/src/adapter.ts`

- [ ] **Step 1: 改 `generateReviewFindings` 的 tool_choice**

把 `OpenAICompatibleAdapter.generateReviewFindings` 中（约 line 373）：

```ts
        tools: [OPENAI_TOOL],
        tool_choice: { type: "function", function: { name: "report_findings" } },
      });
```

改成：

```ts
        tools: [OPENAI_TOOL],
        tool_choice: "auto",
      });
```

- [ ] **Step 2: 改 `generateReviewFindings` 的解析路径**

把 `generateReviewFindings` 中从 `const toolCall = choice?.message?.tool_calls?.[0];` 开始到 `return { findings };` 结束这一段（约 line 391–413）：

```ts
    const toolCall = choice?.message?.tool_calls?.[0];
    if (!toolCall || toolCall.type !== "function") {
      throw new Error(
        "OpenAI-compatible API did not return expected tool call for report_findings"
      );
    }
    if (toolCall.function.name !== "report_findings") {
      throw new Error(
        "OpenAI-compatible API did not return expected tool call for report_findings"
      );
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(toolCall.function.arguments);
    } catch {
      throw new Error(
        `Failed to parse report_findings arguments: ${toolCall.function.arguments}`
      );
    }

    const findings = validateAndNormalizeFindings(parsed);
    return { findings };
  }
```

替换为：

```ts
    const toolCall = choice?.message?.tool_calls?.[0];
    let parsed: unknown | undefined;

    if (toolCall && toolCall.type === "function") {
      if (toolCall.function.name !== "report_findings") {
        throw new Error(
          "OpenAI-compatible API did not return expected tool call for report_findings"
        );
      }
      try {
        parsed = JSON.parse(toolCall.function.arguments);
      } catch {
        throw new Error(
          `Failed to parse report_findings arguments: ${toolCall.function.arguments}`
        );
      }
    } else {
      const content =
        typeof choice?.message?.content === "string"
          ? choice.message.content
          : undefined;
      parsed = extractJsonFromText(content);
      if (parsed === undefined) {
        throw new Error(
          "OpenAI-compatible API did not return expected tool call for report_findings"
        );
      }
      log("info", "OpenAI-compatible findings parsed via content fallback", {
        prNumber: context.prNumber,
      });
    }

    const findings = validateAndNormalizeFindings(parsed);
    return { findings };
  }
```

- [ ] **Step 3: 改 `generateReviewSummary` 的 tool_choice**

把 `generateReviewSummary` 中（约 line 437）：

```ts
        tools: [OPENAI_SUMMARY_TOOL],
        tool_choice: { type: "function", function: { name: "report_summary" } },
      });
```

改成：

```ts
        tools: [OPENAI_SUMMARY_TOOL],
        tool_choice: "auto",
      });
```

- [ ] **Step 4: 改 `generateReviewSummary` 的解析路径**

把 `generateReviewSummary` 中从 `const toolCall = choice?.message?.tool_calls?.[0];` 开始到 `return { summary };` 结束这一段（约 line 455–477）：

```ts
    const toolCall = choice?.message?.tool_calls?.[0];
    if (!toolCall || toolCall.type !== "function") {
      throw new Error(
        "OpenAI-compatible API did not return expected tool call for report_summary"
      );
    }
    if (toolCall.function.name !== "report_summary") {
      throw new Error(
        "OpenAI-compatible API did not return expected tool call for report_summary"
      );
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(toolCall.function.arguments);
    } catch {
      throw new Error(
        `Failed to parse report_summary arguments: ${toolCall.function.arguments}`
      );
    }

    const summary = validateAndNormalizeSummary(parsed);
    return { summary };
  }
}
```

替换为：

```ts
    const toolCall = choice?.message?.tool_calls?.[0];
    let parsed: unknown | undefined;

    if (toolCall && toolCall.type === "function") {
      if (toolCall.function.name !== "report_summary") {
        throw new Error(
          "OpenAI-compatible API did not return expected tool call for report_summary"
        );
      }
      try {
        parsed = JSON.parse(toolCall.function.arguments);
      } catch {
        throw new Error(
          `Failed to parse report_summary arguments: ${toolCall.function.arguments}`
        );
      }
    } else {
      const content =
        typeof choice?.message?.content === "string"
          ? choice.message.content
          : undefined;
      parsed = extractJsonFromText(content);
      if (parsed === undefined) {
        throw new Error(
          "OpenAI-compatible API did not return expected tool call for report_summary"
        );
      }
      log("info", "OpenAI-compatible summary parsed via content fallback", {
        prNumber: context.prNumber,
      });
    }

    const summary = validateAndNormalizeSummary(parsed);
    return { summary };
  }
}
```

- [ ] **Step 5: typecheck**

Run：

```bash
pnpm --filter @reviewer/ai run typecheck
```

Expected：通过，无 error。

- [ ] **Step 6: 跑测试**

Run：

```bash
pnpm --filter @reviewer/ai run test
```

Expected：所有用例 PASS（含 Task 2、Task 3 新增的 13 个用例）。

- [ ] **Step 7: 整体 typecheck + lint**

Run（在仓库根目录）：

```bash
pnpm typecheck && pnpm --filter @reviewer/ai run lint
```

Expected：通过。

- [ ] **Step 8: 提交**

```bash
git add packages/ai/src/adapter.ts
git commit -m "$(cat <<'EOF'
fix: tool_choice=auto + content JSON fallback for OpenAI-compat / 修复 thinking 模式 tool_choice 兼容性

阿里 DashScope 的 thinking 模型拒绝 object/required 形式的 tool_choice，
导致 worker 调 Qwen3 thinking 模型直接 400。改成 "auto" 后再加一层
fallback：模型若没回 tool_call，就从 message.content 文本里抽 JSON
（裸 JSON / ```json fenced / first-{ 到 last-}）。

兼容标准 OpenAI 与阿里 thinking / 非 thinking 模型。
EOF
)"
```

---

## Task 6: 端到端验证

**Files:** 无修改，仅验证。

- [ ] **Step 1: 仓库根 typecheck**

Run：

```bash
pnpm typecheck
```

Expected：所有 package 通过。

- [ ] **Step 2: 仓库根 test**

Run：

```bash
pnpm test
```

Expected：root tests 与 `@reviewer/ai` test 全部通过。

- [ ] **Step 3: 用真实 Gitee webhook 重放（手动验收，可选）**

如果本地有 worker + Redis 跑着，重发上次失败的 webhook（参考会话日志里的 `delivery_id: 1777384395730-8f485d9fc10045b2`），观察 worker 不再抛 `tool_choice ... in thinking mode` 错误，review run 状态推进到 `completed`。

如果没法本地重放，可在 staging 部署后用同 PR 触发，看 review_run 表里 `error_message` 字段是否被清。

---

## Self-Review

- **Spec 覆盖**：
  - ✅ tool_choice 改 "auto"（Task 5 Step 1、Step 3）
  - ✅ extractJsonFromText 三策略（Task 4 Step 1）
  - ✅ 解析 fallback 接入两个方法（Task 5 Step 2、Step 4）
  - ✅ 错误文案保持原文（Task 5 中的 throw 消息与原代码一致）
  - ✅ 测试矩阵：bare JSON、fenced、garbage、tool_call 主路径、wrong name、no message（Task 2、Task 3）
  - ✅ 不动 AnthropicAdapter / config.ts / AiAdapterConfig / env / 调用方（无相关任务）
- **Placeholder 扫描**：无 TBD / TODO / "适当处理" 等 vague 表述。
- **类型一致性**：`extractJsonFromText` 签名 `(text: string | null | undefined) => unknown | undefined` 在 Task 4 定义、Task 5 调用一致；`parsed: unknown | undefined` 在两个方法里都一致；错误文案两处都使用 `report_findings` / `report_summary` 各自的字面量。
- **顺序依赖**：Task 1 → 2 → 3 → 4 → 5 → 6，前一个 Task 的产物（test script / reference 测试 / helper / 实现）依次被后一个使用，OK。
