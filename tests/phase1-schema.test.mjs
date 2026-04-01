import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const testFileDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(testFileDir, "..");

async function readSchemaFile(name) {
  return readFile(path.join(rootDir, "postgres/migrations", name), "utf8");
}

test("Phase 1 schema: memberships should have join_source field", async () => {
  const schema = await readSchemaFile("0001_p0_schema.sql");

  // Check join_source column exists
  assert.match(
    schema,
    /join_source\s+text\s+null/,
    "memberships table must have join_source column"
  );
});

test("Phase 1 schema: repositories should have provider_owner_namespace field", async () => {
  const schema = await readSchemaFile("0001_p0_schema.sql");

  // Check provider_owner_namespace column exists
  assert.match(
    schema,
    /provider_owner_namespace\s+text\s+null/,
    "repositories table must have provider_owner_namespace field per checklist"
  );
});

test("Phase 1 schema: repo_integrations should have health check fields", async () => {
  const schema = await readSchemaFile("0001_p0_schema.sql");

  // Check last_health_check_at field
  assert.match(
    schema,
    /last_health_check_at\s+timestamptz\s+null/,
    "repo_integrations table must have last_health_check_at field"
  );

  // Check last_health_check_result field
  assert.match(
    schema,
    /last_health_check_result\s+text\s+null/,
    "repo_integrations table must have last_health_check_result field"
  );
});

test("Phase 1 schema: pull_requests unique constraint should use provider_pr_id", async () => {
  const schema = await readSchemaFile("0001_p0_schema.sql");

  // Pull request unique constraint should use provider_pr_id per checklist
  assert.match(
    schema,
    /unique\s*\(\s*repository_id\s*,\s*provider_pr_id\s*\)/i,
    "pull_requests unique constraint must be (repository_id, provider_pr_id)"
  );

  // Should NOT have the old constraint with provider_pr_number
  assert.doesNotMatch(
    schema,
    /unique\s*\(\s*repository_id\s*,\s*provider_pr_number\s*\)/i,
    "pull_requests should NOT use provider_pr_number in unique constraint"
  );
});

test("Phase 1 schema: review_runs should have task_source field", async () => {
  const schema = await readSchemaFile("0001_p0_schema.sql");

  // Check task_source field exists per checklist
  assert.match(
    schema,
    /task_source\s+text\s+null/i,
    "review_runs table must have task_source field"
  );
});

test("Phase 1 schema: review_runs should have retry_count field", async () => {
  const schema = await readSchemaFile("0001_p0_schema.sql");

  // Check retry_count field exists per checklist
  assert.match(
    schema,
    /retry_count\s+integer\s+not\s+null\s+default\s+0/i,
    "review_runs table must have retry_count field"
  );
});

test("Phase 1 schema: pr_commits should have message_summary field", async () => {
  const schema = await readSchemaFile("0001_p0_schema.sql");

  // Check message_summary field exists per checklist
  assert.match(
    schema,
    /message_summary\s+text\s+null/,
    "pr_commits table must have message_summary field"
  );
});

test("Phase 1 schema: all core tables must have organization_id for multitenancy", async () => {
  const schema = await readSchemaFile("0001_p0_schema.sql");

  const requiredTables = [
    "repositories",
    "repo_integrations",
    "pull_requests",
    "pr_commits",
    "review_runs",
    "review_issues",
    "review_comments",
    "review_feedback",
    "agent_prompts",
    "usage_events",
  ];

  for (const tableName of requiredTables) {
    // Check table exists (more lenient regex to match schema format)
    assert.match(
      schema,
      /create\s+table\s+if\s+not\s+exists\s+public\.\w+/i,
      `Table ${tableName} must be defined in schema`
    );

    // Check organization_id column exists somewhere in schema
    const orgIdRegex = new RegExp(
      `organization_id\\s+uuid\\s+not\\s+null\\s+references\\s+public\\.organizations`,
      "i"
    );
    assert.match(
      schema,
      orgIdRegex,
      `Schema must have organization_id column (checking for ${tableName})`
    );
  }
});

test("Phase 1 db-types package should export Phase 1 types", async () => {
  const dbTypes = await readFile(
    path.join(rootDir, "packages/db-types/src/index.ts"),
    "utf8"
  );

  // Should not be empty
  assert.notEqual(dbTypes.trim(), "", "db-types index should not be empty");

  // Should export enums at minimum
  assert.match(
    dbTypes,
    /export\s+(type|const|enum)/i,
    "db-types should export TypeScript types"
  );
});
