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
  const rawDays = Number.parseInt(url.searchParams.get('days') ?? '30', 10);
  const days = Number.isNaN(rawDays) ? 30 : Math.min(Math.max(rawDays, 1), 366);
  const timezone = url.searchParams.get('timezone') ?? 'UTC';

  if (!permissions || permissions.withoutPermission('view_transactions')) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 403 });
  }

  const { data, error } = await supabase.rpc('get_spending_trends', {
    _ws_id: normalizedWsId,
    _days: days,
    _timezone: timezone,
  });

  if (error) {
    console.error('Error fetching spending trends:', error);
    return NextResponse.json(
      { message: 'Failed to fetch spending trends' },
      { status: 500 }
    );
  }

  return NextResponse.json(
    (data ?? []).map((point) => ({
      date: point.date,
      amount: Number(point.amount ?? 0),
    }))
  );
}
