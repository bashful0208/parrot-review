/**
 * 把 registrar 抛出的 WEBHOOK_* 错误码翻成对用户友好的中文提示。
 * 未知 code 时直接返回兜底文案 + 原 message。
 */
export function describeWebhookError(
  errorCode: string | undefined,
  errorMessage: string | undefined,
  provider: string
): string {
  switch (errorCode) {
    case "WEBHOOK_PERMISSION_DENIED":
      return provider === "github"
        ? "PAT 缺少 admin:repo_hook 权限，请去 GitHub Token 设置中补上 webhook 权限后点重试，或按下方指引手动配置"
        : "Token 缺少 hook 权限，请在 Gitee Token 设置中补上 webhooks 权限后点重试，或按下方指引手动配置";
    case "WEBHOOK_PROVIDER_UNAVAILABLE":
      return "暂时连接不上 Git 平台，请稍后重试，或按下方指引手动配置";
    case "WEBHOOK_UNSUPPORTED":
      return "该平台暂不支持自动注册 webhook，请按下方指引手动配置";
    case "WEBHOOK_ALREADY_EXISTS":
      return "目标仓库已存在相同 URL 的 webhook，已复用";
    default:
      return errorMessage ?? "自动注册 webhook 失败，请按下方指引手动配置";
  }
}
