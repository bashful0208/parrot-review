/**
 * 在不验签的前提下从 webhook raw body 取出 repository.id。
 * 仅作为按仓库查 webhook secret 的 DB 查询 key——不执行任何代码、不做信任决策。
 * 真正的安全边界仍由后续的签名校验把守。
 */
export function extractProviderRepoId(rawBody: string): string | undefined {
  try {
    const parsed = JSON.parse(rawBody) as {
      repository?: { id?: number | string };
    };
    const id = parsed?.repository?.id;
    return id != null ? String(id) : undefined;
  } catch {
    return undefined;
  }
}
