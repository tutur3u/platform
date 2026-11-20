import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';

export const DEFAULT_GUEST_MEMBERSHIP_WARNINGS = {
  linkFailed: 'Failed to link user to guest group.',
  noGuestGroups: 'No guest group found in this workspace.',
  unlinkFailed: 'Failed to unlink user from guest group.',
} as const;

type GuestMembershipWarningMessages = Partial<
  Record<keyof typeof DEFAULT_GUEST_MEMBERSHIP_WARNINGS, string>
>;

export async function syncWorkspaceUserGuestMembership({
  actorId,
  isGuest,
  sbAdmin,
  userId,
  warningMessages,
  wsId,
}: {
  actorId: string;
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

  const { data: hasEligibleGroups, error } = await sbAdmin
    .schema('private')
    .rpc('admin_sync_guest_group_memberships', {
      p_actor_auth_uid: actorId,
      p_is_guest: isGuest,
      p_user_id: userId,
      p_ws_id: wsId,
    });

  if (error) {
    console.error('Error synchronizing guest workspace user groups', {
      error,
      userId,
      wsId,
    });
    return isGuest ? warnings.linkFailed : warnings.unlinkFailed;
  }

  if (!hasEligibleGroups && isGuest) return warnings.noGuestGroups;
}
