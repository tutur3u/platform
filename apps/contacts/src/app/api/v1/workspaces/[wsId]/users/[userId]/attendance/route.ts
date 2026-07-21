import { getSatelliteAppSessionUser } from '@tuturuuu/satellite/auth';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import { connection, NextResponse } from 'next/server';

interface Params {
  params: Promise<{
    userId: string;
    wsId: string;
  }>;
}

const MONTH_PATTERN = /^(\d{4})-(0[1-9]|1[0-2])$/;

function getMonthRange(month: string) {
  const match = MONTH_PATTERN.exec(month);
  if (!match) return null;

  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  return {
    end: new Date(Date.UTC(year, monthIndex + 1, 1)).toISOString(),
    start: new Date(Date.UTC(year, monthIndex, 1)).toISOString(),
  };
}

export async function GET(request: Request, { params }: Params) {
  await connection();

  const actor = await getSatelliteAppSessionUser('contacts');
  if (!actor?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { userId, wsId: rawWsId } = await params;
  const month = new URL(request.url).searchParams.get('month');
  const range = month ? getMonthRange(month) : null;
  if (!range) {
    return NextResponse.json(
      { message: 'Valid month is required' },
      { status: 400 }
    );
  }

  const permissions = await getPermissions({
    request,
    user: actor,
    wsId: rawWsId,
  });
  if (!permissions) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  if (!permissions.containsPermission('check_user_attendance')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const searchParams = new URL(request.url).searchParams;
  const groupIds = searchParams.getAll('groupIds').filter(Boolean);
  const sbAdmin = await createAdminClient({ noCookie: true });
  let query = sbAdmin
    .from('user_group_attendance')
    .select(
      'date, session_id, status, groups:workspace_user_groups!inner(id, name)'
    )
    .eq('user_id', userId)
    .eq('groups.ws_id', permissions.wsId)
    .gte('date', range.start)
    .lt('date', range.end);

  if (groupIds.length > 0) {
    query = query.in('group_id', groupIds);
  }

  const { data, error } = await query;
  if (error) {
    console.error('Error fetching Contacts user attendance', {
      error,
      userId,
      wsId: permissions.wsId,
    });
    return NextResponse.json(
      { message: 'Error fetching attendance' },
      { status: 500 }
    );
  }

  return NextResponse.json({ attendance: data ?? [] });
}
