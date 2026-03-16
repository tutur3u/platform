import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';

interface Params {
  params: Promise<{
    wsId: string;
  }>;
}

export async function GET(req: Request, { params }: Params) {
  const { wsId } = await params;
  const { searchParams } = new URL(req.url);
  const start = searchParams.get('start');
  const end = searchParams.get('end');
  const status = searchParams.get('status');
  const offset = Number.parseInt(searchParams.get('offset') ?? '0', 10);
  const limit = Number.parseInt(searchParams.get('limit') ?? '500', 10);

  if (!start || !end) {
    return NextResponse.json(
      { message: 'start and end dates are required' },
      { status: 400 }
    );
  }

  // Check permissions
  const permissions = await getPermissions({ wsId, request: req });
  if (!permissions) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  const { containsPermission } = permissions;
  if (!containsPermission('view_users_private_info')) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 403 });
  }

  const sbAdmin = await createAdminClient();

  let query = sbAdmin
    .from('workspace_user_status_changes')
    .select(
      `
      id,
      user_id,
      ws_id,
      archived,
      archived_until,
      creator_id,
      created_at,
      user:user_id (full_name, display_name),
      creator:creator_id (full_name, display_name)
    `
    )
    .eq('ws_id', wsId)
    .gte('created_at', start)
    .lt('created_at', end)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (status === 'archived') {
    query = query.eq('archived', true);
  } else if (status === 'active') {
    query = query.eq('archived', false);
  }

  const { data, error } = await query;

  if (error) {
    console.error(error);
    return NextResponse.json(
      { message: 'Error fetching audit logs' },
      { status: 500 }
    );
  }

  const mappedLogs = (data || []).map((entry) => {
    const user = entry.user as unknown as {
      full_name: string | null;
      display_name: string | null;
    } | null;
    const creator = entry.creator as unknown as {
      full_name: string | null;
      display_name: string | null;
    } | null;

    return {
      id: entry.id,
      user_id: entry.user_id,
      ws_id: entry.ws_id,
      archived: entry.archived,
      archived_until: entry.archived_until,
      creator_id: entry.creator_id,
      created_at: entry.created_at,
      user_full_name: user?.full_name || user?.display_name,
      creator_full_name: creator?.full_name || creator?.display_name,
    };
  });

  return NextResponse.json(mappedLogs);
}
