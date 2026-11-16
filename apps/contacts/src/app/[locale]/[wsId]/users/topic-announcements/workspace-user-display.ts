import type { WorkspaceBasicUserRecord } from '@tuturuuu/internal-api';
import { getInitials, resolveUserFullName } from '@tuturuuu/utils/name-helper';

export function getWorkspaceUserDisplayName(
  user: WorkspaceBasicUserRecord | null | undefined
) {
  return resolveUserFullName(user, { fallback: '—' });
}

export function getWorkspaceUserSecondaryLabel(
  user: WorkspaceBasicUserRecord | null | undefined
) {
  if (!user?.email?.trim()) return null;

  const primary = getWorkspaceUserDisplayName(user);
  if (primary === user.email.trim()) return null;

  return user.email.trim();
}

export function getWorkspaceUserInitials(
  user: WorkspaceBasicUserRecord | null | undefined
) {
  return getInitials(getWorkspaceUserDisplayName(user)) || '??';
}
