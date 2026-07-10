import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import type { WorkspaceUser } from '@tuturuuu/types/primitives/WorkspaceUser';

export async function fetchRequireAttentionUserIds(
  sbAdmin: TypedSupabaseClient,
  {
    wsId,
    userIds,
    groupId,
  }: {
    wsId: string;
    userIds?: string[];
    groupId?: string;
  }
) {
  const normalizedUserIds = [...new Set((userIds ?? []).filter(Boolean))];

  if (userIds && normalizedUserIds.length === 0) {
    return new Set<string>();
  }

  const { data, error } = await sbAdmin.rpc(
    'get_workspace_users_require_attention',
    {
      p_ws_id: wsId,
      p_user_ids: normalizedUserIds.length > 0 ? normalizedUserIds : undefined,
      p_group_id: groupId,
    }
  );

  if (error) {
    throw error;
  }

  return new Set(
    (data ?? [])
      .map((row) => row.user_id)
      .filter((userId): userId is string => Boolean(userId))
  );
}

export function withRequireAttentionFlag<T extends WorkspaceUser>(
  users: T[],
  requireAttentionUserIds: Set<string>
) {
  return users.map((user) => ({
    ...user,
    has_require_attention_feedback: requireAttentionUserIds.has(user.id),
  }));
}
