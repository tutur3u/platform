import type { WorkspaceUser } from '@tuturuuu/types/primitives/WorkspaceUser';

export function canShowPlatformLinkRepairAction(
  user: WorkspaceUser,
  extraData?: Record<string, unknown>
) {
  const hasKnownLinkState = !!extraData?.hasPublicInfo;
  const hasRepairPermission =
    !!extraData?.canUpdateUsers && !!extraData?.hasPrivateInfo;
  const hasEmail = typeof user.email === 'string' && user.email.trim() !== '';
  const hasLinkedUsers =
    Array.isArray(user.linked_users) && user.linked_users.length > 0;

  return (
    hasKnownLinkState &&
    hasRepairPermission &&
    hasEmail &&
    !hasLinkedUsers &&
    !!user.id &&
    !!user.ws_id
  );
}
