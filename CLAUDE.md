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
