import { createAdminClient } from '@tuturuuu/supabase/next/server';
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

  const rawPage = request.nextUrl.searchParams.get('page') ?? '0';
  if (!/^(0|[1-9]\d{0,2})$/.test(rawPage)) {
    return NextResponse.json(
      { error: 'Invalid activity page' },
      { status: 400, headers }
    );
  }
  const until =
    request.nextUrl.searchParams.get('until') ?? new Date().toISOString();
  const parsedUntil = Date.parse(until);
  if (
    !Number.isFinite(parsedUntil) ||
    new Date(parsedUntil).toISOString() !== until ||
    parsedUntil > Date.now() + 5000
  ) {
    return NextResponse.json(
      { error: 'Invalid activity boundary' },
      { status: 400, headers }
    );
  }
  const page = Number(rawPage);
  const offset = page * 200;
  const since = new Date(0).toISOString();
  // Tasks are deliberately not SELECT-granted to authenticated in production.
  // Membership is checked with the caller's client before this scoped read.
  const admin = await createAdminClient({
    noCookie: true,
    auditActorId: user.id,
  });
  // Match Calendar SELECT authorization before the audited service-role read.
  // Raw authenticated SELECT is not granted in production.
  const calendarAccess = await supabase.rpc('has_workspace_permission', {
    p_ws_id: wsId,
    p_user_id: user.id,
    p_permission: 'manage_calendar',
  });
  const [tasks, transactions, notes, events] = await Promise.all([
    admin
      .from('tasks')
      .select(
        'id,name,created_at,task_lists!inner(board_id,workspace_boards!inner(ws_id))'
      )
      .eq('task_lists.workspace_boards.ws_id', wsId)
      .eq('creator_id', user.id)
      .is('deleted_at', null)
      .gte('created_at', since)
      .lte('created_at', until)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .range(offset, offset + 199),
    // The finance RPC applies wallet visibility and confidentiality permissions.
    supabase.rpc('get_wallet_transactions_with_permissions', {
      p_ws_id: wsId,
      p_user_id: user.id,
      p_creator_ids: [user.id],
      p_order_by: 'created_at',
      p_limit: 200,
      p_offset: offset,
    }),
    supabase
      .from('notes')
      .select('id,title,created_at,updated_at')
      .eq('ws_id', wsId)
      .eq('creator_id', user.id)
      .eq('deleted', false)
      .gte('created_at', since)
      .lte('created_at', until)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .range(offset, offset + 199),
    calendarAccess.error
      ? { data: [], error: calendarAccess.error }
      : calendarAccess.data !== true
        ? { data: [], error: null }
        : admin
            .from('workspace_calendar_events')
            .select('id,created_at')
            .eq('ws_id', wsId)
            .gte('created_at', since)
            .lte('created_at', until)
            .order('created_at', { ascending: false })
            .order('id', { ascending: false })
            .range(offset, offset + 199),
  ]);

  const sources = { tasks, transactions, notes, events };
  const failedSources = Object.entries(sources).filter(
    ([, result]) => result.error
  );
  for (const [source, result] of failedSources) {
    console.error('Could not load mobile profile activity source', {
      source,
      code: result.error?.code,
    });
  }
  if (failedSources.length === Object.keys(sources).length) {
    return NextResponse.json(
      { error: 'Could not load activity' },
      { status: 500, headers }
    );
  }

  const items = [
    ...(!tasks.error ? (tasks.data ?? []) : []).map((task) => ({
      id: task.id,
      type: 'task',
      title: task.name,
      boardId: task.task_lists.board_id,
      createdAt: task.created_at,
      scope: 'personal',
    })),
    ...(!transactions.error ? (transactions.data ?? []) : [])
      .filter(
        (transaction) =>
          transaction.platform_creator_id === user.id &&
          typeof transaction.created_at === 'string' &&
          transaction.created_at >= since &&
          transaction.created_at <= until
      )
      .map((transaction) => ({
        id: transaction.id,
        type: 'transaction',
        createdAt: transaction.created_at,
        scope: 'personal',
      })),
    ...(!notes.error ? (notes.data ?? []) : []).map((note) => ({
      id: note.id,
      type: 'note',
      title: note.title,
      createdAt: note.created_at,
      scope: 'personal',
    })),
    ...(!events.error ? (events.data ?? []) : []).map((event) => ({
      id: event.id,
      type: 'calendar',
      createdAt: event.created_at,
      scope: 'workspace',
    })),
  ].filter((item) => item.createdAt != null);
  items.sort((left, right) => right.createdAt!.localeCompare(left.createdAt!));

  const hasMore = Object.values(sources).some(
    (result) => !result.error && (result.data?.length ?? 0) === 200
  );
  return NextResponse.json(
    {
      items,
      until,
      nextPage: hasMore && page < 999 ? page + 1 : null,
      partial: failedSources.length > 0,
      failedSources: failedSources.map(([source]) => source),
      limited: [tasks, transactions, notes, events].some(
        (result) => (result.data?.length ?? 0) === 200
      ),
    },
    { headers }
  );
}
