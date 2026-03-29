# P0 Basic Engineering Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the minimum shared engineering foundation for P0 by standardizing package layout, environment loading, root scripts, formatting/lint/typecheck entrypoints, structured logs, and error categories.

**Architecture:** Move cross-app runtime helpers into `packages/core`, keep `apps/web` and `apps/worker` thin, and create small package stubs for future `ai`, `git`, and `db-types` work. Define environment, logging, and error contracts in reusable modules so the same rules apply in API routes, workers, and future integrations.

**Tech Stack:** `pnpm workspace`, `TypeScript`, `Next.js 16`, `BullMQ`, `ioredis`, `node:test`, `ESLint`, `Prettier`

---

## File Structure

- Create: `docs/superpowers/plans/2026-03-29-p0-basic-engineering.md`
- Create: `packages/core/package.json`
- Create: `packages/core/tsconfig.json`
- Create: `packages/core/src/index.ts`
- Create: `packages/core/src/env.ts`
- Create: `packages/core/src/logging.ts`
- Create: `packages/core/src/errors.ts`
- Create: `packages/core/src/review-queue.ts`
- Create: `packages/ai/package.json`
- Create: `packages/ai/tsconfig.json`
- Create: `packages/ai/src/index.ts`
- Create: `packages/git/package.json`
- Create: `packages/git/tsconfig.json`
- Create: `packages/git/src/index.ts`
- Create: `packages/db-types/package.json`
- Create: `packages/db-types/tsconfig.json`
- Create: `packages/db-types/src/index.ts`
- Create: `tsconfig.base.json`
- Create: `tsconfig.json`
- Create: `.prettierrc.json`
- Create: `.prettierignore`
- Create: `tests/basic-engineering.test.mjs`
- Modify: `package.json`
- Modify: `scripts/setup.sh`
- Modify: `apps/web/package.json`
- Modify: `apps/worker/package.json`
- Modify: `apps/worker/src/index.ts`
- Modify: `apps/worker/src/index.test.ts`
- Modify: `apps/worker/src/queue.integration.test.ts`
- Modify: `apps/web/src/app/api/reviews/enqueue/route.ts`
