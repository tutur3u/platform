import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import { resolveCoMemberNames } from '@tuturuuu/utils/co-member-names';
import { resolveUserDisplayName } from '@tuturuuu/utils/name-helper';
import { verifySecret } from '@tuturuuu/utils/workspace-helper';

export async function getWorkspaceMembers(
  wsId: string,
  args: Record<string, unknown>
) {
  const supabase = await createClient();
  const includeInvited = (args.includeInvited as boolean) ?? false;

  let query = supabase
    .from('workspace_members_and_invites')
    .select('id, display_name, avatar_url, email, pending')
    .eq('ws_id', wsId)
    .order('display_name');

  if (!includeInvited) {
    query = query.eq('pending', false);
  }

  const [{ data, error }, hideEmail] = await Promise.all([
    query.limit(100),
    // D246: emails are a name fallback only when HIDE_MEMBER_EMAIL is off.
    verifySecret({
      wsId,
      forceAdmin: true,
      name: 'HIDE_MEMBER_EMAIL',
      value: 'true',
    }),
  ]);

  if (error) throw error;

  return {
    members: (data || []).map((m) => ({
      id: m.id,
      name: resolveUserDisplayName(
        { ...m, email: hideEmail ? null : m.email },
        { fallback: 'Unknown' }
      ),
      avatarUrl: m.avatar_url,
      isPending: m.pending,
    })),
    count: data?.length || 0,
  };
}

export type AssigneeProfile = {
  id?: string | null;
  display_name?: string | null;
  handle?: string | null;
  avatar_url?: string | null;
};

/**
 * Names task assignees for the viewer. Nameless co-members are named by email
 * (D246) only after the resolver's HIDE_MEMBER_EMAIL and membership checks.
 */
export async function resolveAssigneeNames(
  wsId: string,
  viewerUserId: string,
  assignees: (AssigneeProfile | null | undefined)[]
) {
  const users = assignees.flatMap((assignee) =>
    assignee?.id
      ? [
          {
            id: assignee.id,
            display_name: assignee.display_name,
            handle: assignee.handle,
          },
        ]
      : []
  );
  if (users.length === 0) return new Map<string, string>();
  return resolveCoMemberNames({
    admin: await createAdminClient(),
    wsId,
    viewerUserId,
    users,
  });
}

export function resolveAssigneeName(
  assignee: AssigneeProfile | null | undefined,
  names: Map<string, string>
) {
  return (
    (assignee?.id ? names.get(assignee.id) : undefined) ||
    resolveUserDisplayName(assignee, { fallback: 'Unknown' })
  );
}
