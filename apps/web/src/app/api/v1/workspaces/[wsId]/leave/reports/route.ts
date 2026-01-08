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

  // Build base query for the year
  const startDate = `${year}-01-01`;
  const endDate = `${year}-12-31`;

  let requestsQuery = supabase
    .from('leave_requests')
    .select(
      `
      id,
      user_id,
      leave_type_id,
      start_date,
      end_date,
      duration_days,
      status,
      leave_type:leave_types(id, name, code, category),
      user:workspace_users!leave_requests_user_id_fkey(
        id,
        display_name,
        user:users(id, display_name, avatar_url)
      )
    `
    )
    .eq('ws_id', normalizedWsId)
    .gte('start_date', startDate)
    .lte('end_date', endDate);

  if (userId) {
    requestsQuery = requestsQuery.eq('user_id', userId);
  }

  const { data: requests, error: requestsError } = await requestsQuery;

  if (requestsError) {
    console.error('Error fetching leave requests:', requestsError);
    return NextResponse.json({ error: requestsError.message }, { status: 500 });
  }

  // Fetch balances for the year
  let balancesQuery = supabase
    .from('leave_balances')
    .select(
      `
      *,
      leave_type:leave_types(id, name, code, category),
      user:workspace_users(
        id,
        display_name,
        user:users(id, display_name, avatar_url)
      )
    `
    )
    .eq('ws_id', normalizedWsId)
    .eq('balance_year', parseInt(year, 10));

  if (userId) {
    balancesQuery = balancesQuery.eq('user_id', userId);
  }

  const { data: balances, error: balancesError } = await balancesQuery;

  if (balancesError) {
    console.error('Error fetching leave balances:', balancesError);
    return NextResponse.json({ error: balancesError.message }, { status: 500 });
  }

  // Calculate summary statistics
  const totalRequests = requests?.length || 0;
  const pendingRequests =
    requests?.filter((r: any) => r.status === 'pending').length || 0;
  const approvedRequests =
    requests?.filter((r: any) => r.status === 'approved').length || 0;
  const rejectedRequests =
    requests?.filter((r: any) => r.status === 'rejected').length || 0;

  const totalDaysRequested =
    requests?.reduce((sum: any, r: any) => sum + (r.duration_days || 0), 0) ||
    0;
  const approvedDays =
    requests
      ?.filter((r: any) => r.status === 'approved')
      .reduce((sum: any, r: any) => sum + (r.duration_days || 0), 0) || 0;

  // Group by leave type
  const byLeaveType = requests?.reduce(
    (acc: any, request: any) => {
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
    {} as Record<string, any>
  );

  // Group by employee
  const byEmployee = requests?.reduce(
    (acc: any, request: any) => {
      const userId = request.user_id;
      const user = request.user as any;
      const userName = user?.display_name || 'Unknown';
      const userDetails = Array.isArray(user?.user) ? user.user[0] : user?.user;
      const userAvatar = userDetails?.avatar_url;

      if (!acc[userId]) {
        acc[userId] = {
          userId,
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

      acc[userId].totalRequests++;
      acc[userId].totalDays += request.duration_days || 0;

      if (request.status === 'pending') acc[userId].pendingRequests++;
      if (request.status === 'approved') {
        acc[userId].approvedRequests++;
        acc[userId].approvedDays += request.duration_days || 0;
      }
      if (request.status === 'rejected') acc[userId].rejectedRequests++;

      return acc;
    },
    {} as Record<string, any>
  );

  // Calculate balance utilization
  const balanceUtilization = balances?.map((balance: any) => {
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
