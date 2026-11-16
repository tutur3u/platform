import type { User } from '@tuturuuu/types/primitives/User';
import { resolveUserDisplayName } from '@tuturuuu/utils/name-helper';

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

export function getTaskDialogUserDisplayName(
  user: TaskDialogUserIdentity | null | undefined
): string {
  return resolveUserDisplayName(user, { emailLocalPart: true });
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
