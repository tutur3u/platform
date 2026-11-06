import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import type { Database } from '@tuturuuu/types';

type ExistingPostCheckUser = Pick<
  Database['private']['Tables']['user_group_post_checks']['Row'],
  'user_id'
>;

type ParticipantError = { message: string; status: 400 | 500 };

export async function validatePostCheckParticipants({
  sbAdmin,
  groupId,
  postId,
  wsId,
  userIds,
}: {
  sbAdmin: TypedSupabaseClient;
  groupId: string;
  postId: string;
  wsId: string;
  userIds: string[];
}): Promise<ParticipantError | null> {
  const uniqueIds = [...new Set(userIds)];
  for (let offset = 0; offset < uniqueIds.length; offset += 200) {
    const batch = uniqueIds.slice(offset, offset + 200);
    const { data, error } = await sbAdmin
      .from('workspace_user_groups_users')
      .select('user_id, workspace_users!inner(ws_id)')
      .eq('group_id', groupId)
      .eq('workspace_users.ws_id', wsId)
      .in('user_id', batch);

    if (error || !data) {
      return { message: 'Unable to validate check participants', status: 500 };
    }
    const members = new Set(data.map((row) => row.user_id));
    const nonMembers = batch.filter((userId) => !members.has(userId));
    if (nonMembers.length === 0) continue;

    const { data: existingChecks, error: existingError } = await sbAdmin
      .schema('private')
      .from('user_group_post_checks')
      .select('user_id, workspace_users!inner(ws_id)')
      .eq('post_id', postId)
      .eq('workspace_users.ws_id', wsId)
      .in('user_id', nonMembers)
      .returns<ExistingPostCheckUser[]>();
    if (existingError || !existingChecks) {
      return { message: 'Unable to validate check participants', status: 500 };
    }
    const existingUsers = new Set(existingChecks.map((row) => row.user_id));
    if (!nonMembers.every((userId) => existingUsers.has(userId))) {
      return { message: 'Invalid check participants', status: 400 };
    }
  }
  return null;
}
