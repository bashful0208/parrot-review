# 测试稳定性修复设计

> 目标：仅修复当前导致 `pnpm test` 失败的测试与测试前提问题，不改动无关实现。

## 设计结论

- 新建一个 `fix/*` 分支承载本次修复。
- 失败测试统一改为基于当前仓库根目录运行，不再依赖本地绝对路径或历史 worktree 目录。
- 依赖 `packages/core/dist` 初始存在的测试，改为在测试内部显式准备前置构建条件，再验证“缺失 dist 时的行为”。
- `package.json` 脚本断言更新为匹配当前仓库真实脚本定义，而不是旧快照。
- 本次仅以 `pnpm test` 作为完成标准，不顺手改业务实现或扩展范围。

## 问题拆分

### 1. 环境耦合问题

当前 `tests/basic-engineering.test.mjs` 直接读取 `.claude/worktrees/p0-foundation` 下的文件。这使测试依赖某个历史本地目录结构，换机器、换分支、清理 worktree 后都会失败。

处理方式：

- 改为使用当前仓库根目录作为测试基准路径。
- 保留原测试意图：验证根脚本和基础包是否存在。
- 不再把任何本地私有目录作为测试前提。

### 2. 断言快照过时问题

当前 `tests/root-scripts.test.mjs` 对根 `package.json` 的 `scripts` 做了过时的完整等值断言，和当前仓库已经存在的 `lint`、`typecheck`、`format:check` 以及新的 `build` 组合不一致。

处理方式：

- 更新断言，使其反映当前仓库真实脚本集合。
- 保持测试目的不变：验证统一工程入口存在且命令正确。

### 3. 构建前提不成立问题

`tests/core-no-dist-workspace.test.mjs`、`tests/web-build-bootstrap.test.mjs`、`tests/worker-build-bootstrap.test.mjs` 都先尝试 `rename packages/core/dist`。这隐含要求测试启动前 `dist` 已存在，但当前仓库在清理产物后不满足该前提。

处理方式：

- 在每个测试开始前显式确保 `packages/core/dist` 已生成。
- 然后再临时移走 `dist`，验证 worker 导入或 app build 是否会重新生成所需产物。
- 这样测试验证的是目标行为，而不是依赖环境里恰好已有构建残留。

## 实施边界

- 允许修改 `tests/*.test.mjs`。
- 如有必要，允许抽取极小的测试辅助逻辑，但仅限测试侧。
- 不修改 `apps/web`、`apps/worker`、`packages/core` 的业务实现，除非测试显示存在真实实现缺陷且无法仅通过修测试解决。

## 错误处理

- 测试中的临时目录或临时重命名必须在 `finally` 中恢复。
- 若前置构建失败，应让测试直接失败并暴露原始错误，不添加静默 fallback。
- 不引入依赖本机目录结构的容错逻辑。

## 验证方式

- 运行 `pnpm test`。
- 若通过，则说明本次目标达成。
- 若仍有失败，再根据剩余失败项继续逐个定位，但仍限制在“让测试与真实仓库状态一致”的范围内。

## 分支策略

- 推荐分支名：`fix/test-stability`
