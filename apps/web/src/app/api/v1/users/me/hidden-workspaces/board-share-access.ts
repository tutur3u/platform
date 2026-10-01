import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';

/** Read-only validation matching workspace discovery's direct board shares. */
export async function hasBoardShareWorkspaceAccess(
  supabase: TypedSupabaseClient,
  actorId: string,
  workspaceId: string
): Promise<boolean> {
  // Use the canonical owner email, never a client-supplied recipient.
  const { data: owner, error } = await supabase
    .from('user_private_details')
    .select('email')
    .eq('user_id', actorId)
    .maybeSingle();
  if (error) throw new Error('Unable to validate share recipient');
  const admin = await createAdminClient();
  const recipients: Array<[string, string]> = [
    ['shared_with_user_id', actorId],
  ];
  const email = owner?.email?.trim().toLowerCase();
  if (email) recipients.push(['shared_with_email', email]);
  for (const [column, value] of recipients) {
    const { data, error: shareError } = await admin
      .from('task_board_shares')
      .select('board_id, workspace_boards!inner(ws_id, deleted_at)')
      .eq(column, value)
      .eq('workspace_boards.ws_id', workspaceId)
      .is('workspace_boards.deleted_at', null)
      .in('permission', ['view', 'edit'])
      .limit(1);
    if (shareError) throw new Error('Unable to validate board share');
    if (data?.length) return true;
  }
  return false;
}
