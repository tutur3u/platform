import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { readAllRows } from './all-rows';

export type QueueIdentity = {
  full_name: string | null;
  display_name: string | null;
  email: string | null;
};

export type LearnerMembership = {
  group_id: string;
  user_id: string;
  group: { name: string | null } | null;
  user: QueueIdentity | null;
};

/**
 * Current learner memberships: non-teacher rows of unarchived learners in
 * `workspace_user_groups_users`. Moving a learner or removing them from a
 * class deletes the row, so absences or feedback recorded in a former class
 * stay in history but no longer list the learner under it.
 */
export function loadCurrentLearnerMemberships({
  sbAdmin,
  wsId,
  groupIds,
  studentUserId,
}: {
  sbAdmin: TypedSupabaseClient;
  wsId: string;
  /** Limits the read to these groups; omit to read the whole workspace. */
  groupIds?: string[];
  studentUserId?: string;
}) {
  return readAllRows<LearnerMembership>((from, to) => {
    let query = sbAdmin
      .from('workspace_user_groups_users')
      .select(
        `group_id,user_id,
      group:workspace_user_groups!workspace_user_roles_users_role_id_fkey!inner(id,ws_id,name),
      user:workspace_users!workspace_user_roles_users_user_id_fkey!inner(id,full_name,display_name,email,archived)`
      )
      .eq('group.ws_id', wsId)
      .eq('user.archived', false)
      .or('role.is.null,role.neq.TEACHER')
      .order('group_id', { ascending: true })
      .order('user_id', { ascending: true });
    if (groupIds) query = query.in('group_id', groupIds);
    if (studentUserId) query = query.eq('user_id', studentUserId);
    return query.range(from, to);
  });
}

/** Tag names per class group, read only when an exclusion rule matches tags. */
export async function loadGroupTagNames({
  sbAdmin,
  wsId,
}: {
  sbAdmin: TypedSupabaseClient;
  wsId: string;
}) {
  const result = await readAllRows<{
    group_id: string;
    tag: { name: string } | null;
  }>((from, to) =>
    sbAdmin
      .from('workspace_user_group_tag_groups')
      .select(
        'group_id,tag_id,tag:workspace_user_group_tags!public_workspace_user_group_tag_groups_tag_id_fkey!inner(name,ws_id)'
      )
      .eq('tag.ws_id', wsId)
      .order('group_id', { ascending: true })
      .order('tag_id', { ascending: true })
      .range(from, to)
  );
  const tags = new Map<string, string[]>();
  for (const row of result.data) {
    if (!row.tag?.name) continue;
    tags.set(row.group_id, [...(tags.get(row.group_id) ?? []), row.tag.name]);
  }
  return { data: tags, error: result.error };
}

/**
 * `group:learner` keys for every current learner of a support group, under
 * each current class that is not itself a support or tutor group. A member
 * with no other class is listed under the support group so nobody is missed.
 */
export function supportQueueKeys(
  memberships: Pick<LearnerMembership, 'group_id' | 'user_id'>[],
  policy: { supportGroupIds: string[]; tutorGroupIds: string[] }
) {
  const keys = new Set<string>();
  if (policy.supportGroupIds.length === 0) return keys;
  const support = new Set(policy.supportGroupIds);
  const tutor = new Set(policy.tutorGroupIds);
  const classes = new Map<string, Set<string>>();
  const supportOf = new Map<string, Set<string>>();
  for (const { group_id, user_id } of memberships) {
    const groupId = group_id.toLowerCase();
    const target = support.has(groupId)
      ? supportOf
      : tutor.has(groupId)
        ? null
        : classes;
    if (!target) continue;
    const groups = target.get(user_id) ?? new Set<string>();
    groups.add(group_id);
    target.set(user_id, groups);
  }
  for (const [learner, supportGroups] of supportOf)
    for (const groupId of classes.get(learner) ?? supportGroups)
      keys.add(`${groupId}:${learner}`);
  return keys;
}
