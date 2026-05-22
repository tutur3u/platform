import type { User } from '@tuturuuu/types/primitives/User';

export type TaskDialogUserIdentity = User & {
  full_name?: string | null;
};

export type TaskDialogCurrentUser = {
  id: string;
  display_name?: string | null;
  full_name?: string | null;
  email?: string | null;
  avatar_url?: string | null;
};

function normalizeName(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export function getTaskDialogUserDisplayName(
  user: TaskDialogUserIdentity | null | undefined
): string {
  const displayName = normalizeName(user?.display_name);
  if (displayName) return displayName;

  const fullName = normalizeName(user?.full_name);
  if (fullName) return fullName;

  const emailName = normalizeName(user?.email?.split('@')[0]);
  if (emailName) return emailName;

  return 'Unknown User';
}

export function normalizeTaskDialogCurrentUser(
  currentUser: TaskDialogCurrentUser
): TaskDialogUserIdentity {
  return {
    id: currentUser.id,
    display_name: currentUser.display_name || null,
    full_name: currentUser.full_name || null,
    avatar_url: currentUser.avatar_url || null,
    email: currentUser.email || null,
  };
}
