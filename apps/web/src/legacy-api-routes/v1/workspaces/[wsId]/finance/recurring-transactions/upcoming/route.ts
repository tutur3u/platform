import { getFinanceRouteContext } from '@tuturuuu/apis/finance/request-access';
import { NextResponse } from 'next/server';
import { resolveFinanceRouteAuthContext } from '@/lib/finance-route-auth';

interface Params {
  params: Promise<{ wsId: string }>;
}

export async function GET(request: Request, { params }: Params) {
  const { wsId } = await params;
  const access = await getFinanceRouteContext(
    request,
    wsId,
    await resolveFinanceRouteAuthContext(request)
  );

  if (access.response) {
    return access.response;
  }

  const { normalizedWsId, permissions, supabase } = access.context;
  const url = new URL(request.url);
  const daysAhead = Number.parseInt(
    url.searchParams.get('daysAhead') ?? '30',
    10
  );

  if (!permissions || permissions.withoutPermission('view_transactions')) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 403 });
  }

  const { data, error } = await supabase.rpc(
    'get_upcoming_recurring_transactions',
    {
      _ws_id: normalizedWsId,
      days_ahead: Number.isNaN(daysAhead) ? 30 : daysAhead,
    }
  );

  if (error) {
    console.error('Error fetching upcoming recurring transactions:', error);
    return NextResponse.json(
      { message: 'Failed to fetch upcoming recurring transactions' },
      { status: 500 }
    );
  }

  return NextResponse.json({ upcomingTransactions: data ?? [] });
}
