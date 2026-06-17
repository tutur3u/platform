export const USER_GROUPS_REFRESH_COOLDOWN_MS = 30 * 1000;

export function shouldRefreshUserGroups(
  now: number,
  lastRefreshAt: number | null,
  cooldownMs = USER_GROUPS_REFRESH_COOLDOWN_MS
) {
  return lastRefreshAt === null || now - lastRefreshAt >= cooldownMs;
}
