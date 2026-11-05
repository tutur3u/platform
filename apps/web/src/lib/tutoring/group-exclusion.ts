import {
  hasTutoringTagExclusions,
  isTutoringGroupExcluded,
  readTutoringPolicyConfigRows,
  TUTORING_POLICY_CONFIG_ID,
  tutoringExclusionReason,
} from '@tuturuuu/internal-api/tutoring-policy';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { NextResponse } from 'next/server';

/** `code` the tutoring API answers with when the class is excluded. */
export const TUTORING_GROUP_EXCLUDED = 'TUTORING_GROUP_EXCLUDED';

function readFailed(source: string, error: unknown, wsId: string) {
  console.error(`Failed to read tutoring exclusion ${source}`, {
    error,
    wsId,
  });
  return NextResponse.json(
    { message: 'Failed to verify tutoring class eligibility' },
    { status: 500 }
  );
}

/**
 * New tutoring sessions follow the workspace class exclusion rules, the same
 * rules the support queue reads: a make-up or weak-support session also reads
 * rules scoped to its reason, and a custom session reads only `all` rules.
 * Booked sessions are not affected; reading and editing them never calls this.
 * Returns a 422 response to send, or null when the session may be created.
 */
export async function denyExcludedTutoringGroup({
  groupId,
  reasonType,
  sbAdmin,
  wsId,
}: {
  groupId: string;
  reasonType: string;
  sbAdmin: TypedSupabaseClient;
  wsId: string;
}) {
  const policyResult = await sbAdmin
    .from('workspace_configs')
    .select('id,value')
    .eq('ws_id', wsId)
    .like('id', `${TUTORING_POLICY_CONFIG_ID}%`);
  if (policyResult.error) return readFailed('policy', policyResult.error, wsId);
  const policy = readTutoringPolicyConfigRows(policyResult.data ?? []);
  const reason = tutoringExclusionReason(reasonType);
  const tutorGroup = policy.tutorGroupIds.includes(groupId.toLowerCase());
  const rulesApply = policy.groupExclusions.some(
    (rule) => rule.scope === 'all' || rule.scope === reason
  );
  if (!tutorGroup && !rulesApply) return null;

  const [groupResult, tagResult] = await Promise.all([
    sbAdmin
      .from('workspace_user_groups')
      .select('id,name')
      .eq('id', groupId)
      .eq('ws_id', wsId)
      .maybeSingle(),
    hasTutoringTagExclusions(policy)
      ? sbAdmin
          .from('workspace_user_group_tag_groups')
          .select(
            'tag:workspace_user_group_tags!public_workspace_user_group_tag_groups_tag_id_fkey!inner(name,ws_id)'
          )
          .eq('group_id', groupId)
          .eq('tag.ws_id', wsId)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (groupResult.error) return readFailed('class', groupResult.error, wsId);
  if (tagResult.error) return readFailed('class tags', tagResult.error, wsId);

  const tags = ((tagResult.data ?? []) as { tag: { name: string } | null }[])
    .map((row) => row.tag?.name)
    .filter((name): name is string => Boolean(name));
  if (
    !isTutoringGroupExcluded(
      policy,
      groupResult.data?.name ?? '',
      reason,
      groupId,
      tags
    )
  )
    return null;

  return NextResponse.json(
    {
      code: TUTORING_GROUP_EXCLUDED,
      message:
        'This class is excluded from tutoring by the workspace tutoring policy',
    },
    { status: 422 }
  );
}
