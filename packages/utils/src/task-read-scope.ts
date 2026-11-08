import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';

export type TaskReadScope =
  | { mode: 'workspace' }
  | { mode: 'boards'; boardIds: string[] };

export async function loadTaskReadScope({
  sbAdmin,
  userId,
  wsId,
}: {
  sbAdmin: TypedSupabaseClient;
  userId: string;
  wsId: string;
}): Promise<TaskReadScope> {
  const { data: membership, error: membershipError } = await sbAdmin
    .from('workspace_members')
    .select('type')
    .eq('ws_id', wsId)
    .eq('user_id', userId)
    .maybeSingle();
  if (membershipError) throw new Error('Task membership lookup failed');
  if (membership?.type === 'MEMBER') return { mode: 'workspace' };

  const shares = () =>
    sbAdmin
      .from('task_board_shares')
      .select('board_id, workspace_boards!inner(ws_id, deleted_at)')
      .eq('workspace_boards.ws_id', wsId)
      .is('workspace_boards.deleted_at', null)
      .in('permission', ['view', 'edit']);
  const { data: directShares, error: directError } = await shares().eq(
    'shared_with_user_id',
    userId
  );
  if (directError) throw new Error('Task share lookup failed');
  const boardIds = new Set<string>();
  for (const share of directShares ?? []) {
    if (typeof share.board_id === 'string') boardIds.add(share.board_id);
  }

  // Only Auth's confirmed identity can satisfy an email-addressed share.
  const { data: identity, error: identityError } =
    await sbAdmin.auth.admin.getUserById(userId);
  if (identityError) throw new Error('Task recipient identity lookup failed');
  const email = identity.user?.email_confirmed_at
    ? identity.user.email?.trim().toLowerCase()
    : undefined;
  if (email) {
    const { data: emailShares, error: emailError } = await shares().eq(
      'shared_with_email',
      email
    );
    if (emailError) throw new Error('Task share lookup failed');
    for (const share of emailShares ?? []) {
      if (typeof share.board_id === 'string') boardIds.add(share.board_id);
    }
  }
  return { mode: 'boards', boardIds: [...boardIds] };
}
