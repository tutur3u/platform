import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import { buildPostgrestRateLimitResponse } from '@/lib/postgrest-rate-limit';

interface Params {
  params: Promise<{
    wsId: string;
    userId: string;
  }>;
}

export async function GET(req: Request, { params }: Params) {
  const { wsId, userId } = await params;
  const { searchParams } = new URL(req.url);
  const month = searchParams.get('month');
  const groupIds = searchParams.getAll('groupIds');

  if (!month) {
    return NextResponse.json({ message: 'Month is required' }, { status: 400 });
  }

  // Check permissions
  const permissions = await getPermissions({ wsId, request: req });
  if (!permissions) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const sbAdmin = await createAdminClient();

  const startDate = new Date(month);
  const endDate = new Date(
    new Date(startDate).setMonth(startDate.getMonth() + 1)
  );

  let query = sbAdmin
    .from('user_group_attendance')
    .select('date, session_id, status, groups:workspace_user_groups(id, name)')
    .eq('user_id', userId)
    .gte('date', startDate.toISOString())
    .lt('date', endDate.toISOString());

  if (groupIds.length > 0) {
    query = query.in('group_id', groupIds);
  }

  const { data, error } = await query;

  if (error) {
    const rateLimitResponse = buildPostgrestRateLimitResponse(error);
    if (rateLimitResponse) {
      return rateLimitResponse;
    }

    console.error('Error fetching user attendance', {
      error,
      userId,
      wsId,
    });
    return NextResponse.json(
      { message: 'Error fetching attendance' },
      { status: 500 }
    );
  }

  return NextResponse.json({ attendance: data || [] });
}
