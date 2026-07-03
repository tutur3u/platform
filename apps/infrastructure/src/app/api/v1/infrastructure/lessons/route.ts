import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import { serverLogger } from '@/lib/infrastructure/log-drain';

export async function GET(req: Request) {
  const permissions = await getPermissions({
    request: req,
    wsId: ROOT_WORKSPACE_ID,
  });

  if (!permissions?.containsPermission('view_infrastructure')) {
    return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
  }

  const sbAdmin = await createAdminClient();

  const { searchParams } = new URL(req.url);
  const wsId = searchParams.get('ws_id');
  const limit = searchParams.get('limit') || '1000';
  const offset = searchParams.get('offset') || '0';

  if (!wsId) {
    return NextResponse.json(
      { message: 'Missing ws_id parameter' },
      { status: 400 }
    );
  }

  const { data, error, count } = await sbAdmin
    .schema('private')
    .from('user_group_posts')
    .select('*, workspace_user_groups!inner(ws_id)', { count: 'exact' })
    .eq('workspace_user_groups.ws_id', wsId)
    .range(
      Number.parseInt(offset, 10),
      Number.parseInt(offset, 10) + Number.parseInt(limit, 10) - 1
    );

  if (error) {
    serverLogger.error('Error fetching user_group_posts:', error);
    return NextResponse.json(
      { message: 'Error fetching user_group_posts' },
      { status: 500 }
    );
  }

  return NextResponse.json({
    data: data || [],
    count: count || 0,
  });
}
