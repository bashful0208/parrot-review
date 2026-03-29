# 2026-03-30 Shared ESLint Configuration Design

## Context

当前仓库已经具备基础 monorepo 结构：

- `apps/web`
- `apps/worker`
- `packages/ai`
- `packages/core`
- `packages/git`
- `packages/db-types`

根目录 `package.json` 已经提供统一脚本：`lint`、`typecheck`、`build`、`test`、`format:check`。

但目前代码质量工具的接入还不一致：

- `apps/web` 已经有 `eslint.config.mjs`，并且 `lint` 脚本真正运行 `eslint`
- `apps/worker` 虽然也有 `lint` 脚本，但实际执行的是 `tsc --noEmit -p tsconfig.json`
- 这意味着当前 `pnpm -r run lint` 在不同应用上的语义不一致：`web` 做的是 ESLint，`worker` 做的是 TypeScript 类型检查

本次设计目标是把 ESLint 共享配置抽出来，并让 `web` 与 `worker` 都真正接入 ESLint，同时保留独立的 `typecheck` 职责。

## Goals

- 为 monorepo 建立一套可复用的共享 ESLint 配置
- 让 `apps/web` 和 `apps/worker` 都通过共享配置接入 ESLint
- 保留 `apps/web` 的 Next.js 专用 lint 能力
- 为 `apps/worker` 提供 TypeScript + Node 场景的真实 ESLint 校验
- 让 `lint` 与 `typecheck` 的职责清晰分离
- 为后续 `packages/*` 接入 ESLint 留出扩展路径

## Non-Goals

- 本轮不要求把所有 `packages/*` 都接入 ESLint
- 本轮不引入过多自定义 lint 规则或风格规则
- 本轮不替换 `Prettier` 的职责，不使用 ESLint 处理格式化
- 本轮不重构现有业务代码以追求“零警告”之外的额外风格统一

## Approaches Considered

### Recommended: Shared ESLint Package

新建一个共享配置包，例如 `packages/eslint-config`，统一导出可复用的 flat config：

- `base`：通用 TypeScript / Node 规则
- `next`：在 `base` 之上叠加 Next.js 规则

使用方式：

- `apps/worker` 使用 `base`
- `apps/web` 使用 `next`

这是最符合 monorepo 结构的方式。配置边界清晰，后续其他应用或包需要接入 ESLint 时也可以继续复用。

### Alternative: Root-Level Shared Config

在仓库根目录放一份总的 `eslint.config.mjs`，通过目录匹配给 `web` 和 `worker` 套规则。

这个方案改动较少，但随着规则增多，根配置容易膨胀，`web` 与 `worker` 的职责差异也会混在一个文件里，长期可维护性较差。

### Rejected: Per-App Copy-Paste Config

分别给 `web` 和 `worker` 各写一份配置，靠人工保持同步。

这个方式最快，但和“共用配置”的目标相悖，后续很容易出现规则漂移和重复维护问题，因此不采用。

## Recommended Design

采用共享配置包方案。

### Package Structure

新增 `packages/eslint-config`，仅放配置导出，不放业务逻辑。

建议结构：

- `packages/eslint-config/package.json`
- `packages/eslint-config/base.mjs`
- `packages/eslint-config/next.mjs`

其中：

- `base.mjs` 负责 TypeScript + Node 的共享规则、忽略目录、通用文件匹配
- `next.mjs` 在 `base.mjs` 之上叠加 `eslint-config-next` 的 flat config

## App Integration

### apps/worker

`apps/worker` 将新增自己的 `eslint.config.mjs`，内容尽量薄，只负责导入共享 `base` 配置。

同时更新脚本职责：

- `lint`：改为真正执行 `eslint`
- `typecheck`：继续执行 `tsc --noEmit -p tsconfig.json`

这样 `worker` 的 lint 与类型检查就不再混用。

### apps/web

`apps/web` 的 `eslint.config.mjs` 改为导入共享 `next` 配置。

这样既能保留 Next.js 规则，也能把共享基础层沉到统一位置，避免未来多端重复维护。

## Dependency Strategy

共享配置包需要承载 ESLint 相关依赖，使其成为规则和插件的统一来源。

预期会把以下依赖统一整理到共享配置层或其消费方能正常解析的位置：

- `eslint`
- `typescript-eslint` 相关包（如采用）
- `eslint-config-next`

设计原则：

- 依赖位置要保证 `web` 和 `worker` 在执行本地 `eslint.config.mjs` 时可以稳定解析
- 尽量减少重复安装在多个 app 下的情况
- 保持与当前 `pnpm workspace` 结构兼容

## File Plan

建议新增或修改以下文件：

- `packages/eslint-config/package.json`
- `packages/eslint-config/base.mjs`
- `packages/eslint-config/next.mjs`
- `apps/web/eslint.config.mjs`
- `apps/worker/eslint.config.mjs`
- `apps/worker/package.json`
- 根目录 `package.json`（如需补充共享依赖或 workspace 脚本说明）
- `tests/basic-engineering.test.mjs`
- `doc/p0-delivery-checklist.md`

## Behavior Changes

完成后，仓库中的相关行为会变成：

- `pnpm -r run lint`：`web` 与 `worker` 都执行真实 ESLint
- `pnpm -r run typecheck`：`web` 与 `worker` 都执行独立 TypeScript 类型检查
- `format:check`：继续由 `Prettier` 负责

这样三者边界明确：

- ESLint 管规则与静态代码质量
- TypeScript 管类型正确性
- Prettier 管格式一致性

## Testing Strategy

本次严格按 TDD 执行，先补失败测试，再做实现。

### Red

先在 `tests/basic-engineering.test.mjs` 中补针对工程配置的失败测试，覆盖：

- `packages/eslint-config` 存在
- `apps/worker/package.json` 中 `lint` 脚本为真实 `eslint` 命令
- `apps/web` 使用共享 ESLint 配置
- `apps/worker` 使用共享 ESLint 配置

先运行测试，确认失败原因是“共享 ESLint 配置尚未接入”，而不是路径或语法错误。

### Green

补齐共享配置包与 app 接入，使测试通过。

### Verification

在配置测试通过后，再运行实际命令验证：

- `pnpm run test -- tests/basic-engineering.test.mjs` 或当前项目等价测试入口
- `pnpm -r run lint`
- 如有必要，再运行 `pnpm -r run typecheck`

## Success Criteria

以下条件同时满足则视为完成：

- 仓库存在共享 ESLint 配置包
- `apps/web` 与 `apps/worker` 都从共享配置包导入配置
- `apps/worker` 的 `lint` 脚本不再是 `tsc`
- 根目录 `lint`、`typecheck`、`format:check` 语义清晰且彼此分工明确
- `doc/p0-delivery-checklist.md` 中“接入 ESLint、TypeScript、Prettier”可以更新为已完成

## Risks and Mitigations

### Risk: Flat Config Resolution Issues

ESLint flat config 在 workspace 包之间引用时，可能出现依赖解析位置不一致的问题。

应对方式：

- 尽量让共享包导出稳定、简单的配置对象
- 使用当前仓库已安装且兼容的依赖组合
- 实现后通过真实 `lint` 命令验证，而不只依赖配置文件存在性

### Risk: Mixing Next.js Rules into Worker

如果共享配置边界设计不好，可能把 Next.js 专用规则带到 `worker`。

应对方式：

- 明确拆分 `base` 与 `next`
- `worker` 只消费 `base`
- `web` 才消费 `next`

## Scope Check

这项工作聚焦于“统一 ESLint 接入方式”，范围适合作为单一实现计划执行：

- 不涉及业务功能开发
- 不要求一次性把所有包都纳入 lint
- 只处理当前最关键的 `web` 与 `worker`

范围足够清晰，不需要再拆成多个独立 spec。
