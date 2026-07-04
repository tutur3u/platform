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

  if (!permissions || permissions.withoutPermission('view_transactions')) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 403 });
  }

  const walletId = url.searchParams.get('walletId');
  const startDate = url.searchParams.get('startDate');
  const endDate = url.searchParams.get('endDate');
  const type = url.searchParams.get('type') ?? 'expense';
  const timezone = url.searchParams.get('timezone') ?? 'UTC';

  const { data, error } = await supabase.rpc('get_category_breakdown', {
    _ws_id: normalizedWsId,
    _start_date: startDate || undefined,
    _end_date: endDate || undefined,
    include_confidential: true,
    _transaction_type: type,
    _interval: 'daily',
    _anchor_to_latest: false,
    _timezone: timezone,
    _wallet_ids: walletId ? [walletId] : undefined,
  });

  if (error) {
    console.error('Error fetching category breakdown:', error);
    return NextResponse.json(
      { message: 'Failed to fetch category breakdown' },
      { status: 500 }
    );
  }

  return NextResponse.json(data ?? []);
}
