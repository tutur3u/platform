import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { getUserGroupRoutePermissions } from '@tuturuuu/users-core/lib/user-groups/route-auth';
import { connection, NextResponse } from 'next/server';

interface Params {
  params: Promise<{ wsId: string; groupId: string; userId: string }>;
}

export async function GET(request: Request, { params }: Params) {
  await connection();
  const { wsId: rawWsId, groupId, userId } = await params;
  const permissions = await getUserGroupRoutePermissions(rawWsId, request);
  if (!permissions) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  if (!permissions.containsPermission('view_user_groups_scores')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const wsId = permissions.wsId;
  const sbAdmin = await createAdminClient({ noCookie: true });
  const { data: group, error: groupError } = await sbAdmin
    .from('workspace_user_groups')
    .select('id')
    .eq('ws_id', wsId)
    .eq('id', groupId)
    .maybeSingle();
  const { data: user, error: userError } = await sbAdmin
    .from('workspace_users')
    .select('id')
    .eq('ws_id', wsId)
    .eq('id', userId)
    .maybeSingle();
  if (groupError || userError) {
    return NextResponse.json(
      { message: 'Error fetching user vitals' },
      { status: 500 }
    );
  }
  if (!group || !user) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  const { data, error } = await sbAdmin
    .from('user_indicators')
    .select(`
      value,
      user_group_metrics!inner(
        id, name, unit, factor, is_weighted, group_id,
        workspace_user_groups!inner(ws_id)
      )
    `)
    .eq('user_id', userId)
    .eq('user_group_metrics.group_id', groupId)
    .eq('user_group_metrics.workspace_user_groups.ws_id', wsId);
  if (error) {
    console.error('Error fetching user vitals', { error, wsId });
    return NextResponse.json(
      { message: 'Error fetching user vitals' },
      { status: 500 }
    );
  }
  return NextResponse.json(
    (data ?? []).map(({ value, user_group_metrics: metric }) => ({
      id: metric.id,
      name: metric.name,
      unit: metric.unit,
      factor: metric.factor,
      is_weighted: metric.is_weighted,
      value,
    }))
  );
}
