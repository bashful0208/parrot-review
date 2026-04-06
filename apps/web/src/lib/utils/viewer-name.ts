import type { AuthenticatedUser } from "@reviewer/core";

export function getViewerName(
  user: Pick<AuthenticatedUser, "email" | "name">
): string {
  if (user.name && user.name.trim().length > 0) return user.name;
  return user.email.split("@")[0];
}
