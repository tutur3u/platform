import { getFinanceRouteContext } from '@tuturuuu/apis/finance/request-access';
import { format } from 'date-fns';
import { NextResponse } from 'next/server';
import { resolveFinanceRouteAuthContext } from '@/lib/finance-route-auth';
import { serverLogger } from '@/lib/infrastructure/log-drain';

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
  const days = Number.parseInt(url.searchParams.get('days') ?? '30', 10);

  if (!permissions || permissions.withoutPermission('view_transactions')) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 403 });
  }

  const startDate = new Date();
  startDate.setDate(startDate.getDate() - (Number.isNaN(days) ? 30 : days));

  const { data, error } = await supabase
    .from('wallet_transactions')
    .select(
      `
        amount,
        taken_at,
        workspace_wallets!inner(ws_id)
      `
    )
    .eq('workspace_wallets.ws_id', normalizedWsId)
    .lt('amount', 0)
    .gte('taken_at', startDate.toISOString())
    .order('taken_at', { ascending: true });

  if (error) {
    serverLogger.error('Error fetching spending trends:', error);
    return NextResponse.json(
      { message: 'Failed to fetch spending trends' },
      { status: 500 }
    );
  }

  const totalDays = Number.isNaN(days) ? 30 : days;
  const dailySpending = new Map<string, number>();

  for (let i = 0; i < totalDays; i += 1) {
    const date = new Date();
    date.setDate(date.getDate() - (totalDays - 1 - i));
    dailySpending.set(format(date, 'yyyy-MM-dd'), 0);
  }

  for (const transaction of data ?? []) {
    const dateKey = format(new Date(transaction.taken_at), 'yyyy-MM-dd');
    const amount = Math.abs(Number(transaction.amount));
    dailySpending.set(dateKey, (dailySpending.get(dateKey) ?? 0) + amount);
  }

  return NextResponse.json(
    Array.from(dailySpending.entries()).map(([date, amount]) => ({
      date,
      amount,
    }))
  );
}
