import { verifyWorkspaceMembershipType } from '@tuturuuu/utils/workspace-helper';
import { connection, type NextRequest, NextResponse } from 'next/server';
import { resolveSessionAuthContext } from '@/lib/api-auth';

const headers = {
  'Cache-Control': 'private, no-store',
  Vary: 'Authorization, Cookie',
};

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ wsId: string }> }
) {
  await connection();
  const { wsId } = await params;
  const auth = await resolveSessionAuthContext(request, {
    allowAppSessionAuth: true,
  });
  if (!auth.ok) return auth.response;
  const { supabase, user } = auth;
  const membership = await verifyWorkspaceMembershipType({
    wsId,
    userId: user.id,
    supabase,
    requiredType: 'ANY',
  });
  if (membership.error === 'membership_lookup_failed')
    return NextResponse.json(
      { error: 'Could not verify access' },
      { status: 500, headers }
    );
  if (!membership.ok)
    return NextResponse.json({ error: 'Forbidden' }, { status: 403, headers });

  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const [tasks, transactions, notes, events] = await Promise.all([
    supabase
      .from('tasks')
      .select(
        'id,name,created_at,task_lists!inner(board_id,workspace_boards!inner(ws_id))'
      )
      .eq('task_lists.workspace_boards.ws_id', wsId)
      .eq('creator_id', user.id)
      .is('deleted_at', null)
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(200),
    supabase
      .from('wallet_transactions')
      .select('id,created_at,workspace_wallets!inner(ws_id)')
      .eq('workspace_wallets.ws_id', wsId)
      .eq('platform_creator_id', user.id)
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(200),
    supabase
      .from('notes')
      .select('id,title,created_at,updated_at')
      .eq('ws_id', wsId)
      .eq('creator_id', user.id)
      .eq('deleted', false)
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(200),
    supabase
      .from('workspace_calendar_events')
      .select('id,created_at')
      .eq('ws_id', wsId)
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(200),
  ]);

  const failure = [tasks, transactions, notes, events].find(
    (result) => result.error
  );
  if (failure?.error) {
    console.error('Could not load mobile profile activity', failure.error);
    return NextResponse.json(
      { error: 'Could not load activity' },
      { status: 500, headers }
    );
  }

  const items = [
    ...(tasks.data ?? []).map((task) => ({
      id: task.id,
      type: 'task',
      title: task.name,
      boardId: task.task_lists.board_id,
      createdAt: task.created_at,
      scope: 'personal',
    })),
    ...(transactions.data ?? []).map((transaction) => ({
      id: transaction.id,
      type: 'transaction',
      createdAt: transaction.created_at,
      scope: 'personal',
    })),
    ...(notes.data ?? []).map((note) => ({
      id: note.id,
      type: 'note',
      title: note.title,
      createdAt: note.created_at,
      scope: 'personal',
    })),
    ...(events.data ?? []).map((event) => ({
      id: event.id,
      type: 'calendar',
      createdAt: event.created_at,
      scope: 'workspace',
    })),
  ].filter((item) => item.createdAt != null);
  items.sort((left, right) => right.createdAt!.localeCompare(left.createdAt!));

  return NextResponse.json(
    {
      items,
      limited: [tasks, transactions, notes, events].some(
        (result) => (result.data?.length ?? 0) === 200
      ),
    },
    { headers }
  );
}
