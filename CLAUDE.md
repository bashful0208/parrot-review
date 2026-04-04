# Superpowers 强制规则

- 处理任何任务前，必须先判断是否有适用的 superpowers skill；有就先用，再做事。
- 新功能/改行为：`superpowers:brainstorming`
- 多步骤任务：`superpowers:writing-plans`
- 写代码修功能或修 bug：`superpowers:test-driven-development`
- 遇到异常或失败：`superpowers:systematic-debugging`
- 宣称完成前：`superpowers:verification-before-completion`
- 阶段完成后：`superpowers:requesting-code-review`
- 只要任务可拆分为多个相对独立的实现步骤，默认优先尝试 `superpowers:subagent-driven-development`
- 仅当任务明显过小、无法拆分、或存在强顺序依赖时，才可以不使用
- 未经我明确同意，不要使用 `superpowers:using-git-worktrees`
- 如与我的直接指令冲突，一律以我的指令为准

## UI 样式约定

- 所有样式实现默认优先使用 `shadcn/ui` 组件，不要随意自造一套视觉和交互样式。
- 涉及 `shadcn/ui` 组件的查询、添加、修复、组合、样式调整时，默认优先使用 `shadcn` skill 协助处理。
- 本项目涉及 `shadcn/ui` 的初始化、查询、加组件、更新组件时，统一以 `apps/web` 作为 workspace；执行 `shadcn` CLI 时显式使用 `-c apps/web`。
- 新增页面、表单、弹窗、下拉、表格、按钮、输入框等 UI 时，优先组合现有 `shadcn/ui` 组件完成。
- 允许基于 `shadcn/ui` 做业务层封装和样式微调，但应保持其无障碍能力、结构约定与可复用性。
- 如需新增基础组件，优先通过 `shadcn` CLI 添加，再按项目设计 token / Tailwind class 做定制。
- 除非有明确需求，不要引入与 `shadcn/ui` 职责重叠的其他通用 UI 组件库。

### `shadcn/ui` 大概用法

1. 安装/引入组件：通过 `shadcn` CLI 添加需要的组件，例如 `button`、`dialog`、`form`、`input`、`select`；在本项目中使用类似 `npx shadcn@latest add button -c apps/web` 的形式。
2. 从项目内生成后的组件路径导入组件，在页面或业务组件中直接组合使用。
3. 样式定制优先通过 `className`、`cn()`、Tailwind utility classes，以及项目已有 design token 完成。
4. 表单场景优先遵循 `Form`、`FormField`、`FormItem`、`FormLabel`、`FormMessage` 等推荐组合，保证结构一致。
5. 交互型组件（如 `Dialog`、`Popover`、`DropdownMenu`）保持 `Trigger` / `Content` / `Header` 等约定式写法，避免破坏可访问性。
6. 如需变体，优先在组件内部用 `class-variance-authority (cva)` 或项目既有模式扩展，不要到处复制样式。

## 日志和错误处理

本项目使用统一的日志和错误处理系统。详见 [pattern.md](pattern.md)。

### 快速参考

- ✅ 使用 `createLogger()` 创建日志器
- ✅ 使用 `AppError` 类定义错误
- ✅ 使用错误映射器转换外部错误
- ✅ 使用 `ensureErrorLogged()` 确保错误不被静默
- ❌ 不要使用 `console.log` 或 `console.error`
- ❌ 不要使用空的 try-catch

### 示例

```typescript
import { createLogger } from '@reviewer/core/logging';
import { mapModelInvocationError } from '@reviewer/core/errors/mappers';
import { ensureErrorLogged } from '@reviewer/core/errors/handler';

const logger = createLogger({ component: 'worker' });

try {
  await operation();
} catch (error) {
  const appError = mapModelInvocationError(error, 'anthropic', {
    operation: 'call_model',
    request: 'call_model',
  });
  ensureErrorLogged(appError, logger);
  throw appError;
}
```
