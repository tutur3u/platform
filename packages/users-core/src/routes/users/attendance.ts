import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import { buildPostgrestRateLimitResponse } from '../../lib/postgrest-rate-limit';
import { getUserGroupRoutePermissions } from '../../lib/user-groups/route-auth';

export interface UserAttendanceParams {
  params: Promise<{ wsId: string; userId: string }>;
}

export async function handleGetUserAttendanceRequest(
  request: Request,
  { params }: UserAttendanceParams,
  actor?: { id: string; email?: string | null }
) {
  const { wsId: rawWsId, userId } = await params;
  const searchParams = new URL(request.url).searchParams;
  const month = searchParams.get('month');
  if (!month || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
    return NextResponse.json(
      { message: 'Valid month is required' },
      { status: 400 }
    );
  }
  const permissions = actor
    ? await getPermissions({ wsId: rawWsId, request, user: actor })
    : await getUserGroupRoutePermissions(rawWsId, request);
  if (!permissions) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  if (!permissions.containsPermission('check_user_attendance')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const wsId = permissions.wsId;
  const sbAdmin = await createAdminClient({ noCookie: true });
  const { data: user, error: userError } = await sbAdmin
    .from('workspace_users')
    .select('id')
    .eq('ws_id', wsId)
    .eq('id', userId)
    .maybeSingle();
  if (userError) {
    return NextResponse.json(
      { message: 'Error fetching attendance' },
      { status: 500 }
    );
  }
  if (!user) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  const groupIds = [
    ...new Set(searchParams.getAll('groupIds').filter(Boolean)),
  ];
  if (groupIds.length > 0) {
    const { data: groups, error } = await sbAdmin
      .from('workspace_user_groups')
      .select('id')
      .eq('ws_id', wsId)
      .in('id', groupIds);
    if (error) {
      return NextResponse.json(
        { message: 'Error fetching attendance' },
        { status: 500 }
      );
    }
    if (groups?.length !== groupIds.length) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
  }
  const start = new Date(`${month}-01T00:00:00.000Z`);
  const end = new Date(start);
  end.setUTCMonth(end.getUTCMonth() + 1);
  let query = sbAdmin
    .from('user_group_attendance')
    .select(
      'date, session_id, status, groups:workspace_user_groups!inner(id, name)'
    )
    .eq('user_id', userId)
    .eq('groups.ws_id', wsId)
    .gte('date', start.toISOString())
    .lt('date', end.toISOString());
  if (groupIds.length > 0) query = query.in('group_id', groupIds);
  const { data, error } = await query;
  if (error) {
    const rateLimitResponse = buildPostgrestRateLimitResponse(error);
    if (rateLimitResponse) return rateLimitResponse;
    console.error('Error fetching user attendance', { error, userId, wsId });
    return NextResponse.json(
      { message: 'Error fetching attendance' },
      { status: 500 }
    );
  }
  return NextResponse.json({ attendance: data ?? [] });
}
