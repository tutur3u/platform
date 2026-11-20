/**
 * QA test accounts carry a service-owned `app_metadata` marker that the
 * database makes immutable. They never count as staff; a `--staff` QA host is
 * admitted only where a gate opts in explicitly (Meet hosting) and only until
 * its run expires.
 */
type QaMarkedUser = {
  email_confirmed_at?: string | null;
  banned_until?: string | null;
  app_metadata?: Record<string, unknown> | null;
};

/** Reserved QA addresses; ordinary signups can never claim one. */
export const QA_TEST_ADDRESS =
  /^qa\+[a-z0-9]{8}-[0-9]{1,3}@(?:tuturuuu|tutur3u)\.com$/u;

export function hasQaTestMarker(user: QaMarkedUser | null | undefined) {
  return user?.app_metadata?.qa_test === true;
}

/** Marked, or holding a reserved address (an interrupted create). */
export function isQaTestAccount(
  user: (QaMarkedUser & { email?: string | null }) | null | undefined
) {
  return (
    hasQaTestMarker(user) ||
    QA_TEST_ADDRESS.test((user?.email ?? '').toLowerCase())
  );
}

export function isActiveQaStaffHost(
  user: QaMarkedUser | null | undefined,
  now = Date.now()
) {
  const metadata = user?.app_metadata;
  if (!user?.email_confirmed_at || metadata?.qa_test !== true) return false;
  // Deletion bans the account first; a banned host stops hosting immediately.
  if (user.banned_until && Date.parse(user.banned_until) > now) return false;
  if (metadata.qa_staff !== true || typeof metadata.qa_expires_at !== 'string')
    return false;
  const expiresAt = Date.parse(metadata.qa_expires_at);
  return Number.isFinite(expiresAt) && expiresAt > now;
}
