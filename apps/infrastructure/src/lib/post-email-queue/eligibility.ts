export const POST_EMAIL_INACTIVE_RECIPIENT_REASON =
  'Recipient is archived or temporarily archived.';
export const POST_EMAIL_UNSUBSCRIBED_RECIPIENT_REASON =
  'Recipient unsubscribed from Tuturuuu system emails.';

export type WorkspaceUserPostEmailStatus = {
  archived?: boolean | null;
  archived_until?: string | null;
} | null;

export function isWorkspaceUserInactiveForPostEmail(
  user: WorkspaceUserPostEmailStatus,
  now = new Date()
) {
  if (!user) return true;
  if (user.archived === true) return true;
  if (!user.archived_until) return false;

  const archivedUntilMs = Date.parse(user.archived_until);
  return Number.isFinite(archivedUntilMs) && archivedUntilMs > now.getTime();
}
