import { getFinanceRouteContext } from '@tuturuuu/apis/finance/request-access';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { resolveFinanceRouteAuthContext } from '@/lib/finance-route-auth';

const recurringTransactionSchema = z.object({
  name: z.string().min(1),
  description: z.string().nullable().optional(),
  amount: z.number(),
  wallet_id: z.string().min(1),
  category_id: z.string().nullable().optional(),
  frequency: z.enum(['daily', 'weekly', 'monthly', 'yearly']),
  start_date: z.string().min(1),
  end_date: z.string().nullable().optional(),
});

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
  if (!permissions || permissions.withoutPermission('view_transactions')) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 403 });
  }

  const { data, error } = await supabase
    .from('recurring_transactions')
    .select('*')
    .eq('ws_id', normalizedWsId)
    .order('next_occurrence', { ascending: true });

  if (error) {
    console.error('Error fetching recurring transactions:', error);
    return NextResponse.json(
      { message: 'Failed to fetch recurring transactions' },
      { status: 500 }
    );
  }

  return NextResponse.json({ recurringTransactions: data ?? [] });
}

export async function POST(request: Request, { params }: Params) {
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
  if (!permissions || permissions.withoutPermission('manage_finance')) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 403 });
  }

  const parsed = recurringTransactionSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { message: parsed.error.issues[0]?.message ?? 'Invalid request body' },
      { status: 400 }
    );
  }

  const { data, error } = await supabase
    .from('recurring_transactions')
    .insert({
      ...parsed.data,
      ws_id: normalizedWsId,
      next_occurrence: parsed.data.start_date,
    })
    .select('*')
    .single();

  if (error) {
    console.error('Error creating recurring transaction:', error);
    return NextResponse.json(
      { message: 'Failed to create recurring transaction' },
      { status: 500 }
    );
  }

  return NextResponse.json(data);
}
