import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { serverLogger } from '@/lib/infrastructure/log-drain';

export const DEFAULT_GUEST_MEMBERSHIP_WARNINGS = {
  linkFailed: 'Failed to link user to guest group.',
  noGuestGroups: 'No guest group found in this workspace.',
  resolveFailed: 'Failed to resolve guest group for this workspace.',
  unlinkFailed: 'Failed to unlink user from guest group.',
} as const;

type GuestMembershipWarningMessages = Partial<
  Record<keyof typeof DEFAULT_GUEST_MEMBERSHIP_WARNINGS, string>
>;

export async function syncWorkspaceUserGuestMembership({
  isGuest,
  sbAdmin,
  userId,
  warningMessages,
  wsId,
}: {
  isGuest: boolean;
  sbAdmin: TypedSupabaseClient;
  userId: string;
  warningMessages?: GuestMembershipWarningMessages;
  wsId: string;
}): Promise<string | undefined> {
  const warnings = {
    ...DEFAULT_GUEST_MEMBERSHIP_WARNINGS,
    ...warningMessages,
  };

  const { data: guestGroups, error: groupError } = await sbAdmin
    .from('workspace_user_groups')
    .select('id')
    .eq('ws_id', wsId)
    .eq('is_guest', true);

  if (groupError) {
    serverLogger.error('Error resolving guest workspace user groups:', {
      error: groupError,
      userId,
      wsId,
    });
    return warnings.resolveFailed;
  }

  const guestGroupIds = [
    ...new Set(
      (guestGroups ?? [])
        .map((group) => group.id)
        .filter((id): id is string => Boolean(id))
    ),
  ];

  if (guestGroupIds.length === 0) {
    return isGuest ? warnings.noGuestGroups : undefined;
  }

  if (isGuest) {
    const { error: linkError } = await sbAdmin
      .from('workspace_user_groups_users')
      .upsert(
        guestGroupIds.map((groupId) => ({
          group_id: groupId,
          user_id: userId,
        })),
        {
          ignoreDuplicates: true,
          onConflict: 'group_id,user_id',
        }
      );

    if (linkError) {
      serverLogger.error('Error linking guest workspace user:', {
        error: linkError,
        guestGroupIds,
        userId,
        wsId,
      });
      return warnings.linkFailed;
    }

    return undefined;
  }

  const { error: unlinkError } = await sbAdmin
    .from('workspace_user_groups_users')
    .delete()
    .eq('user_id', userId)
    .in('group_id', guestGroupIds);

  if (unlinkError) {
    serverLogger.error('Error unlinking guest workspace user:', {
      error: unlinkError,
      guestGroupIds,
      userId,
      wsId,
    });
    return warnings.unlinkFailed;
  }

  return undefined;
}
