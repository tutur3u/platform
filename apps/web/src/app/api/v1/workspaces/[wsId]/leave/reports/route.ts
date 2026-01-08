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
  const year = searchParams.get('year') || new Date().getFullYear().toString();
  const userId = searchParams.get('userId');

  const permissions = await getPermissions({ wsId: normalizedWsId });

  // Only managers can view reports (contains sensitive employee data)
  if (!permissions.containsPermission('manage_workforce')) {
    return NextResponse.json(
      { error: 'Only managers can view leave reports' },
      { status: 403 }
    );
  }

  const supabase = await createClient();

  // Get current user for RPC call
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Fetch requests for the year
  const { data: requestsData, error: requestsError } = await supabase.rpc(
    'get_leave_requests_with_details',
    {
      p_ws_id: normalizedWsId,
      p_user_id: user.id,
      p_filter_user_id: userId ?? undefined,
      p_filter_year: parseInt(year, 10),
      p_can_manage_workforce: true,
    }
  );

  if (requestsError) {
    console.error('Error fetching leave requests:', requestsError);
    return NextResponse.json({ error: requestsError.message }, { status: 500 });
  }

  // Fetch balances for the year
  const { data: balancesData, error: balancesError } = await supabase.rpc(
    'get_leave_balances_with_details',
    {
      p_ws_id: normalizedWsId,
      p_user_id: user.id,
      p_filter_user_id: userId ?? undefined,
      p_filter_year: parseInt(year, 10),
    }
  );

  if (balancesError) {
    console.error('Error fetching leave balances:', balancesError);
    return NextResponse.json({ error: balancesError.message }, { status: 500 });
  }

  const requests = (requestsData || []) as Array<{
    id: string;
    user_id: string;
    leave_type_id: string;
    start_date: string;
    end_date: string;
    duration_days: number;
    status: string;
    leave_type: { id: string; name: string; code: string; category: string };
    user: {
      id: string;
      display_name: string;
      user: { id: string; display_name: string; avatar_url: string | null };
    };
  }>;
  const balances = (balancesData || []) as Array<{
    id: string;
    user_id: string;
    leave_type_id: string;
    accrued_days: number;
    used_days: number;
    adjusted_days: number;
    balance_year: number;
    leave_type: { id: string; name: string; code: string; category: string };
    user: {
      id: string;
      display_name: string;
      user: { id: string; display_name: string; avatar_url: string | null };
    };
  }>;

  // Calculate summary statistics
  const totalRequests = requests.length;
  const pendingRequests = requests.filter((r) => r.status === 'pending').length;
  const approvedRequests = requests.filter(
    (r) => r.status === 'approved'
  ).length;
  const rejectedRequests = requests.filter(
    (r) => r.status === 'rejected'
  ).length;

  const totalDaysRequested = requests.reduce(
    (sum, r) => sum + (r.duration_days || 0),
    0
  );
  const approvedDays = requests
    .filter((r) => r.status === 'approved')
    .reduce((sum, r) => sum + (r.duration_days || 0), 0);

  // Group by leave type
  const byLeaveType = requests.reduce(
    (acc, request) => {
      const typeId = request.leave_type_id;
      const typeName = request.leave_type?.name || 'Unknown';
      const typeCode = request.leave_type?.code || 'unknown';

      if (!acc[typeId]) {
        acc[typeId] = {
          leaveTypeId: typeId,
          leaveTypeName: typeName,
          leaveTypeCode: typeCode,
          category: request.leave_type?.category || 'custom',
          totalRequests: 0,
          pendingRequests: 0,
          approvedRequests: 0,
          rejectedRequests: 0,
          totalDays: 0,
          approvedDays: 0,
        };
      }

      acc[typeId].totalRequests++;
      acc[typeId].totalDays += request.duration_days || 0;

      if (request.status === 'pending') acc[typeId].pendingRequests++;
      if (request.status === 'approved') {
        acc[typeId].approvedRequests++;
        acc[typeId].approvedDays += request.duration_days || 0;
      }
      if (request.status === 'rejected') acc[typeId].rejectedRequests++;

      return acc;
    },
    {} as Record<
      string,
      {
        leaveTypeId: string;
        leaveTypeName: string;
        leaveTypeCode: string;
        category: string;
        totalRequests: number;
        pendingRequests: number;
        approvedRequests: number;
        rejectedRequests: number;
        totalDays: number;
        approvedDays: number;
      }
    >
  );

  // Group by employee
  const byEmployee = requests.reduce(
    (acc, request) => {
      const empUserId = request.user_id;
      const reqUser = request.user;
      const userName = reqUser?.display_name || 'Unknown';
      const userDetails = reqUser?.user;
      const userAvatar = userDetails?.avatar_url;

      if (!acc[empUserId]) {
        acc[empUserId] = {
          userId: empUserId,
          userName,
          userAvatar,
          totalRequests: 0,
          pendingRequests: 0,
          approvedRequests: 0,
          rejectedRequests: 0,
          totalDays: 0,
          approvedDays: 0,
        };
      }

      acc[empUserId].totalRequests++;
      acc[empUserId].totalDays += request.duration_days || 0;

      if (request.status === 'pending') acc[empUserId].pendingRequests++;
      if (request.status === 'approved') {
        acc[empUserId].approvedRequests++;
        acc[empUserId].approvedDays += request.duration_days || 0;
      }
      if (request.status === 'rejected') acc[empUserId].rejectedRequests++;

      return acc;
    },
    {} as Record<
      string,
      {
        userId: string;
        userName: string;
        userAvatar: string | null | undefined;
        totalRequests: number;
        pendingRequests: number;
        approvedRequests: number;
        rejectedRequests: number;
        totalDays: number;
        approvedDays: number;
      }
    >
  );

  // Calculate balance utilization
  const balanceUtilization = balances.map((balance) => {
    const totalDays =
      (balance.accrued_days || 0) + (balance.adjusted_days || 0);
    const usedDays = balance.used_days || 0;
    const availableDays = totalDays - usedDays;

    return {
      userId: balance.user_id,
      userName: balance.user?.display_name || 'Unknown',
      leaveTypeId: balance.leave_type_id,
      leaveTypeName: balance.leave_type?.name || 'Unknown',
      accruedDays: balance.accrued_days || 0,
      adjustedDays: balance.adjusted_days || 0,
      totalDays,
      usedDays,
      availableDays,
      utilizationPercentage:
        totalDays > 0 ? Math.round((usedDays / totalDays) * 100) : 0,
    };
  });

  return NextResponse.json({
    summary: {
      year: parseInt(year, 10),
      totalRequests,
      pendingRequests,
      approvedRequests,
      rejectedRequests,
      totalDaysRequested,
      approvedDays,
    },
    byLeaveType: Object.values(byLeaveType || {}),
    byEmployee: Object.values(byEmployee || {}),
    balanceUtilization: balanceUtilization || [],
  });
}
