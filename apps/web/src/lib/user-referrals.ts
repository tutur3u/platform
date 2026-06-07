import 'server-only';

import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import type { WorkspaceUser } from '@tuturuuu/types/primitives/WorkspaceUser';
import {
  fetchRequireAttentionUserIds,
  withRequireAttentionFlag,
} from '@/lib/require-attention-users';
import { matchesWorkspaceUserSearch } from '@/lib/workspace-user-search';

type ReferralCandidate = Pick<
  WorkspaceUser,
  'display_name' | 'email' | 'full_name' | 'id' | 'phone'
>;

export async function listAvailableReferralUsers(
  sbAdmin: TypedSupabaseClient,
  {
    currentUserId,
    q,
    wsId,
  }: {
    currentUserId: string;
    q?: string | null;
    wsId: string;
  }
) {
  const { data: currentUser, error: currentUserError } = await sbAdmin
    .from('workspace_users')
    .select('referred_by')
    .eq('ws_id', wsId)
    .eq('id', currentUserId)
    .maybeSingle();

  if (currentUserError) throw currentUserError;
  if (!currentUser) return [] as WorkspaceUser[];

  let candidatesQuery = sbAdmin
    .from('workspace_users')
    .select('id, full_name, display_name, email, phone')
    .eq('ws_id', wsId)
    .eq('archived', false)
    .neq('id', currentUserId)
    .is('referred_by', null);

  if (currentUser.referred_by) {
    candidatesQuery = candidatesQuery.neq('id', currentUser.referred_by);
  }

  const { data, error } = await candidatesQuery.order('full_name', {
    ascending: true,
    nullsFirst: false,
  });

  if (error) throw error;

  const availableUsers = ((data ?? []) as ReferralCandidate[]).filter((user) =>
    matchesWorkspaceUserSearch(user, q)
  );
  const requireAttentionUserIds = await fetchRequireAttentionUserIds(sbAdmin, {
    wsId,
    userIds: availableUsers.map((user) => user.id),
  });

  return withRequireAttentionFlag(
    availableUsers as unknown as WorkspaceUser[],
    requireAttentionUserIds
  );
}
