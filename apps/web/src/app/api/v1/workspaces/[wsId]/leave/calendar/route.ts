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

  // Parse status filter
  let statuses: string[] | null = null;
  if (includeStatuses) {
    const validStatuses = [
      'approved',
      'cancelled',
      'pending',
      'rejected',
      'withdrawn',
    ] as const;
    const parsedStatuses = includeStatuses
      .split(',')
      .map((s) => s.trim())
      .filter((s): s is (typeof validStatuses)[number] =>
        validStatuses.includes(s as any)
      );
    if (parsedStatuses.length > 0) {
      statuses = parsedStatuses;
    }
  }

  // userId parameter is already a workspace_user ID
  const filterWorkspaceUserId = userId || undefined;

  // Call RPC function
  const { data, error } = await supabase.rpc('get_leave_calendar_events', {
    p_ws_id: normalizedWsId,
    p_start_date: startDate,
    p_end_date: endDate,
    p_user_id: currentUser.id,
    p_filter_user_id: filterWorkspaceUserId,
    p_statuses: statuses || undefined,
    p_can_manage_workforce: canManageWorkforce,
  });

  if (error) {
    console.error('Error fetching calendar data:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Transform RPC result to calendar format
  const requests =
    (data as Array<{
      id: string;
      user_id: string;
      leave_type_id: string;
      start_date: string;
      end_date: string;
      is_half_day_start: boolean;
      is_half_day_end: boolean;
      duration_days: number;
      status: string;
      leave_type: {
        id: string;
        name: string;
        code: string;
        color: string;
        icon: string;
      };
      user: {
        id: string;
        display_name: string;
        user: {
          id: string;
          display_name: string;
          avatar_url: string | null;
        };
      };
    }>) || [];

  const calendarEvents = requests.map((request) => {
    const user = request.user;
    const userDetails = user?.user;

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
