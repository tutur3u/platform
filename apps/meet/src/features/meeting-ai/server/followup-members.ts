import 'server-only';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { MeetAiError } from './access';

export async function readFollowupMembers(
  db: TypedSupabaseClient,
  workspaceId: string
) {
  const [members, secrets] = await Promise.all([
    db
      .from('workspace_members_and_invites')
      .select('id, display_name, email, avatar_url')
      .eq('ws_id', workspaceId)
      .eq('pending', false)
      .eq('type', 'MEMBER')
      .order('id')
      .limit(1000),
    db
      .from('workspace_secrets')
      .select('name')
      .eq('ws_id', workspaceId)
      .in('name', ['HIDE_MEMBER_EMAIL', 'HIDE_MEMBER_NAME'])
      .eq('value', 'true'),
  ]);
  if (members.error || secrets.error)
    throw new MeetAiError(503, 'Workspace members unavailable');
  const hidden = new Set(secrets.data.map((row) => row.name));
  return members.data.flatMap((member) =>
    member.id
      ? [
          {
            id: member.id,
            displayName: hidden.has('HIDE_MEMBER_NAME')
              ? null
              : member.display_name,
            email: hidden.has('HIDE_MEMBER_EMAIL') ? null : member.email,
            avatarUrl: member.avatar_url,
          },
        ]
      : []
  );
}
