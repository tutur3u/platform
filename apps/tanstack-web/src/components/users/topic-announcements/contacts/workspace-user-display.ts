import type { WorkspaceBasicUserRecord } from '@tuturuuu/internal-api';
import { getInitials } from '@tuturuuu/utils/name-helper';

export function getWorkspaceUserDisplayName(
  user: WorkspaceBasicUserRecord | null | undefined
) {
  if (!user) return '-';

  const fullName = user.full_name?.trim();
  if (fullName) return fullName;

  const displayName = user.display_name?.trim();
  if (displayName) return displayName;

  const email = user.email?.trim();
  if (email) return email;

  return '-';
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
