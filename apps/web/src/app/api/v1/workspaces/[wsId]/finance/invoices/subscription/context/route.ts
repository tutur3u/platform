import { getFinanceRouteContext } from '@tuturuuu/apis/finance/request-access';
import { NextResponse } from 'next/server';
import { resolveFinanceRouteAuthContext } from '@/lib/finance-route-auth';
import { serverLogger } from '@/lib/infrastructure/log-drain';

interface Params {
  params: Promise<{
    wsId: string;
  }>;
}

export async function GET(req: Request, { params }: Params) {
  const { wsId } = await params;
  const access = await getFinanceRouteContext(
    req,
    wsId,
    await resolveFinanceRouteAuthContext(req)
  );

  if (access.response) {
    return access.response;
  }

  const { normalizedWsId, permissions, sbAdmin } = access.context;

  if (permissions.withoutPermission('create_invoices')) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 403 });
  }

  const requestUrl = new URL(req.url);
  const userId = requestUrl.searchParams.get('userId')?.trim();
  const month = requestUrl.searchParams.get('month')?.trim();
  const groupIds = requestUrl.searchParams
    .getAll('groupIds')
    .map((groupId) => groupId.trim())
    .filter(Boolean);

  if (!userId || !month || groupIds.length === 0) {
    return NextResponse.json({
      attendance: [],
      latestInvoices: [],
    });
  }

  const startOfMonth = new Date(`${month}-01`);
  const nextMonth = new Date(startOfMonth);
  nextMonth.setMonth(nextMonth.getMonth() + 1);

  const { data: validGroups, error: validGroupsError } = await sbAdmin
    .from('workspace_user_groups_users')
    .select('group_id, workspace_user_groups!inner(ws_id)')
    .eq('user_id', userId)
    .eq('role', 'STUDENT')
    .eq('workspace_user_groups.ws_id', normalizedWsId)
    .in('group_id', groupIds);

  if (validGroupsError) {
    serverLogger.error(
      'Error fetching valid groups for subscription invoice context:',
      validGroupsError
    );
    return NextResponse.json(
      { message: 'Error fetching subscription invoice context' },
      { status: 500 }
    );
  }

  const validGroupIds = (validGroups ?? [])
    .map((row) => row.group_id)
    .filter((groupId): groupId is string => !!groupId);

  if (validGroupIds.length === 0) {
    return NextResponse.json({
      attendance: [],
      latestInvoices: [],
    });
  }

  const [attendanceResponse, latestInvoicesResponse] = await Promise.all([
    sbAdmin
      .from('user_group_attendance')
      .select('date, status, group_id')
      .in('group_id', validGroupIds)
      .eq('user_id', userId)
      .gte('date', startOfMonth.toISOString().split('T')[0] || '')
      .lt('date', nextMonth.toISOString().split('T')[0] || '')
      .order('date', { ascending: true }),
    sbAdmin
      .from('finance_invoice_user_groups')
      .select(
        'user_group_id, finance_invoices!inner(valid_until, created_at, completed_at)'
      )
      .in('user_group_id', validGroupIds)
      .eq('finance_invoices.customer_id', userId)
      .not('finance_invoices.completed_at', 'is', null)
      .order('created_at', {
        referencedTable: 'finance_invoices',
        ascending: false,
      }),
  ]);

  if (attendanceResponse.error) {
    serverLogger.error(
      'Error fetching subscription attendance context:',
      attendanceResponse.error
    );
    return NextResponse.json(
      { message: 'Error fetching subscription invoice context' },
      { status: 500 }
    );
  }

  if (latestInvoicesResponse.error) {
    serverLogger.error(
      'Error fetching subscription invoice history context:',
      latestInvoicesResponse.error
    );
    return NextResponse.json(
      { message: 'Error fetching subscription invoice context' },
      { status: 500 }
    );
  }

  const sortedRows = (latestInvoicesResponse.data ?? [])
    .slice()
    .sort((a, b) => {
      const aDate = a.finance_invoices?.created_at
        ? new Date(a.finance_invoices.created_at).getTime()
        : 0;
      const bDate = b.finance_invoices?.created_at
        ? new Date(b.finance_invoices.created_at).getTime()
        : 0;
      return bDate - aDate;
    });

  const latestInvoicesMap = new Map<
    string,
    { group_id: string; valid_until: string | null; created_at: string }
  >();

  sortedRows.forEach((row) => {
    const groupId = row.user_group_id;
    if (groupId && !latestInvoicesMap.has(groupId)) {
      latestInvoicesMap.set(groupId, {
        group_id: groupId,
        valid_until: row.finance_invoices?.valid_until ?? null,
        created_at: row.finance_invoices?.created_at ?? '',
      });
    }
  });

  return NextResponse.json({
    attendance: attendanceResponse.data ?? [],
    latestInvoices: Array.from(latestInvoicesMap.values()),
  });
}
