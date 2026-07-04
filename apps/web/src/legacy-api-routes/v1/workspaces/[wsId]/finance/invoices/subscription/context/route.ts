import { getFinanceRouteContext } from '@tuturuuu/apis/finance/request-access';
import { NextResponse } from 'next/server';
import { resolveFinanceRouteAuthContext } from '@/lib/finance-route-auth';

interface Params {
  params: Promise<{
    wsId: string;
  }>;
}

function getComparableTimestamp(value: string | null | undefined) {
  if (!value) return 0;
  const timestamp = new Date(value).getTime();
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

const MAX_PREPAID_MONTH_COUNT = 12;

function resolveMonthCount(
  value: string | null
):
  | { monthCount: number; error?: never }
  | { error: string; monthCount?: never } {
  if (!value) return { monthCount: 1 };

  const monthCount = Number(value);
  if (
    !Number.isInteger(monthCount) ||
    monthCount < 1 ||
    monthCount > MAX_PREPAID_MONTH_COUNT
  ) {
    return {
      error: `monthCount must be an integer between 1 and ${MAX_PREPAID_MONTH_COUNT}`,
    };
  }

  return { monthCount };
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
  const monthCountResult = resolveMonthCount(
    requestUrl.searchParams.get('monthCount')
  );
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

  if ('error' in monthCountResult) {
    return NextResponse.json(
      { message: monthCountResult.error },
      { status: 400 }
    );
  }

  const startOfMonth = new Date(`${month}-01`);
  const nextMonth = new Date(startOfMonth);
  nextMonth.setMonth(nextMonth.getMonth() + monthCountResult.monthCount);

  const { data: validGroups, error: validGroupsError } = await sbAdmin
    .from('workspace_user_groups_users')
    .select(
      'group_id, workspace_user_groups!workspace_user_roles_users_role_id_fkey!inner(ws_id)'
    )
    .eq('user_id', userId)
    .eq('role', 'STUDENT')
    .eq('workspace_user_groups.ws_id', normalizedWsId)
    .in('group_id', groupIds);

  if (validGroupsError) {
    console.error(
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
    console.error(
      'Error fetching subscription attendance context:',
      attendanceResponse.error
    );
    return NextResponse.json(
      { message: 'Error fetching subscription invoice context' },
      { status: 500 }
    );
  }

  if (latestInvoicesResponse.error) {
    console.error(
      'Error fetching subscription invoice history context:',
      latestInvoicesResponse.error
    );
    return NextResponse.json(
      { message: 'Error fetching subscription invoice context' },
      { status: 500 }
    );
  }

  const sortedRows = (latestInvoicesResponse.data ?? [])
    .filter(
      (row) =>
        row.finance_invoices?.completed_at &&
        getComparableTimestamp(row.finance_invoices?.valid_until) > 0
    )
    .slice()
    .sort((a, b) => {
      const aValidUntil = getComparableTimestamp(
        a.finance_invoices?.valid_until
      );
      const bValidUntil = getComparableTimestamp(
        b.finance_invoices?.valid_until
      );

      if (aValidUntil !== bValidUntil) {
        return bValidUntil - aValidUntil;
      }

      const aCreatedAt = getComparableTimestamp(a.finance_invoices?.created_at);
      const bCreatedAt = getComparableTimestamp(b.finance_invoices?.created_at);
      return bCreatedAt - aCreatedAt;
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
