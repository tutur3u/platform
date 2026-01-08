import { createClient } from '@tuturuuu/supabase/next/server';
import {
  getPermissions,
  normalizeWorkspaceId,
} from '@tuturuuu/utils/workspace-helper';
import { type NextRequest, NextResponse } from 'next/server';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ wsId: string }> }
) {
  const { wsId } = await params;
  const normalizedWsId = await normalizeWorkspaceId(wsId);
  const searchParams = req.nextUrl.searchParams;
  const startDate = searchParams.get('startDate');
  const endDate = searchParams.get('endDate');
  const userId = searchParams.get('userId');
  const includeStatuses = searchParams.get('statuses'); // comma-separated

  const permissions = await getPermissions({ wsId: normalizedWsId });

  // All workspace members can view calendar
  const hasAnyPermission = permissions.permissions.length > 0;

  if (!hasAnyPermission) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  if (!startDate || !endDate) {
    return NextResponse.json(
      { error: 'startDate and endDate query parameters are required' },
      { status: 400 }
    );
  }

  const supabase = await createClient();

  // Get current user to determine if they can see all requests
  const {
    data: { user: currentUser },
  } = await supabase.auth.getUser();

  if (!currentUser) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const canManageWorkforce = permissions.containsPermission('manage_workforce');

  let query = supabase
    .from('leave_requests')
    .select(
      `
      id,
      user_id,
      leave_type_id,
      start_date,
      end_date,
      is_half_day_start,
      is_half_day_end,
      duration_days,
      status,
      leave_type:leave_types(id, name, code, color, icon),
      user:workspace_users!leave_requests_user_id_fkey(
        id,
        display_name,
        user:users(id, display_name, avatar_url)
      )
    `
    )
    .eq('ws_id', normalizedWsId);

  // Date range filter - check for any overlap with requested range
  query = query.or(`and(start_date.lte.${endDate},end_date.gte.${startDate})`);

  // If not a manager, only show own requests
  if (!canManageWorkforce) {
    const { data: workspaceUser } = await supabase
      .from('workspace_users')
      .select('id')
      .eq('ws_id', normalizedWsId)
      .eq('user_id', currentUser.id)
      .single();

    if (!workspaceUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    query = query.eq('user_id', workspaceUser.id);
  }

  // Filter by user if specified
  if (userId) {
    query = query.eq('user_id', userId);
  }

  // Filter by status if specified
  if (includeStatuses) {
    const validStatuses = [
      'approved',
      'cancelled',
      'pending',
      'rejected',
      'withdrawn',
    ] as const;
    const statuses = includeStatuses
      .split(',')
      .map((s) => s.trim())
      .filter((s): s is (typeof validStatuses)[number] =>
        validStatuses.includes(s as any)
      );
    if (statuses.length > 0) {
      query = query.in('status', statuses);
    }
  } else {
    // Default: only show approved and pending requests
    query = query.in('status', ['approved', 'pending'] as const);
  }

  query = query.order('start_date', { ascending: true });

  const { data, error } = await query;

  if (error) {
    console.error('Error fetching calendar data:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Transform data for calendar format
  const calendarEvents = data?.map((request: any) => {
    const user = request.user as any;
    const userDetails = Array.isArray(user?.user) ? user.user[0] : user?.user;

    return {
      id: request.id,
      title: `${user?.display_name || 'Unknown'} - ${request.leave_type?.name || 'Leave'}`,
      start: request.start_date,
      end: request.end_date,
      allDay: !request.is_half_day_start && !request.is_half_day_end,
      color: request.leave_type?.color || '#3b82f6',
      extendedProps: {
        userId: request.user_id,
        leaveTypeId: request.leave_type_id,
        leaveTypeName: request.leave_type?.name,
        leaveTypeCode: request.leave_type?.code,
        leaveTypeIcon: request.leave_type?.icon,
        userName: user?.display_name,
        userAvatar: userDetails?.avatar_url,
        duration: request.duration_days,
        status: request.status,
        isHalfDayStart: request.is_half_day_start,
        isHalfDayEnd: request.is_half_day_end,
      },
    };
  });

  return NextResponse.json(calendarEvents);
}
