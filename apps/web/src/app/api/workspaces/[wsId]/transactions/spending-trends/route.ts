import { createClient } from '@tuturuuu/supabase/next/server';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import { format } from 'date-fns';
import { NextResponse } from 'next/server';

interface Params {
  params: Promise<{ wsId: string }>;
}

export async function GET(request: Request, { params }: Params) {
  const supabase = await createClient(request);
  const { wsId } = await params;
  const url = new URL(request.url);
  const days = Number.parseInt(url.searchParams.get('days') ?? '30', 10);

  const permissions = await getPermissions({ wsId, request });
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
    .eq('workspace_wallets.ws_id', wsId)
    .lt('amount', 0)
    .gte('taken_at', startDate.toISOString())
    .order('taken_at', { ascending: true });

  if (error) {
    console.error('Error fetching spending trends:', error);
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
