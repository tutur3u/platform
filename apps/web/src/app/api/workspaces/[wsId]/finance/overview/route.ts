import { getFinanceRouteContext } from '@tuturuuu/apis/finance/request-access';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { MAX_COLOR_LENGTH } from '@tuturuuu/utils/constants';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { resolveFinanceRouteAuthContext } from '@/lib/finance-route-auth';
import { serverLogger } from '@/lib/infrastructure/log-drain';

const querySchema = z.object({
  view: z.enum(['date', 'month', 'year']).optional().default('date'),
  startDate: z.string().max(MAX_COLOR_LENGTH).optional().nullable(),
  endDate: z.string().max(MAX_COLOR_LENGTH).optional().nullable(),
  includeConfidential: z
    .enum(['true', 'false'])
    .optional()
    .default('true')
    .transform((value) => value === 'true'),
});

type FinanceOverviewMetricsRpcRow = {
  wallet_count?: number | string | null;
  category_count?: number | string | null;
  transaction_count?: number | string | null;
  invoice_count?: number | string | null;
  total_income?: number | string | null;
  total_expense?: number | string | null;
  net_total?: number | string | null;
  recent_transaction_count?: number | string | null;
  recent_income_count?: number | string | null;
  recent_expense_count?: number | string | null;
  recent_total_income?: number | string | null;
  recent_total_expense?: number | string | null;
  recent_net_total?: number | string | null;
  latest_transaction_at?: string | null;
};

type FinanceOverviewMetricsPrivateClient = {
  schema(schema: 'private'): {
    rpc(
      fn: 'get_finance_overview_metrics',
      args: {
        _actor_id: string;
        _end_date?: string;
        _start_date?: string;
        _view: 'date' | 'month' | 'year';
        _ws_id: string;
        include_confidential: boolean;
      }
    ): Promise<{
      data: FinanceOverviewMetricsRpcRow[] | null;
      error: { message?: string } | null;
    }>;
  };
};

interface Params {
  params: Promise<{ wsId: string }>;
}

const toNumber = (value: number | string | null | undefined) =>
  Number(value ?? 0);

export async function GET(request: Request, { params }: Params) {
  try {
    const { wsId } = await params;
    const access = await getFinanceRouteContext(
      request,
      wsId,
      await resolveFinanceRouteAuthContext(request)
    );

    if (access.response) {
      return access.response;
    }

    const { normalizedWsId, permissions, sbAdmin, user } = access.context;

    if (permissions.withoutPermission('view_finance_stats')) {
      return NextResponse.json(
        { message: 'Insufficient permissions' },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const parsed = querySchema.safeParse({
      endDate: searchParams.get('endDate'),
      includeConfidential: searchParams.get('includeConfidential') ?? undefined,
      startDate: searchParams.get('startDate'),
      view: searchParams.get('view') ?? undefined,
    });

    if (!parsed.success) {
      return NextResponse.json(
        { message: 'Invalid query parameters' },
        { status: 400 }
      );
    }

    const { data, error } = await (
      sbAdmin as unknown as FinanceOverviewMetricsPrivateClient &
        TypedSupabaseClient
    )
      .schema('private')
      .rpc('get_finance_overview_metrics', {
        _actor_id: user.id,
        _end_date: parsed.data.endDate || undefined,
        _start_date: parsed.data.startDate || undefined,
        _view: parsed.data.view,
        _ws_id: normalizedWsId,
        include_confidential: parsed.data.includeConfidential,
      });

    if (error) throw error;

    const metrics = data?.[0] ?? {};

    return NextResponse.json({
      categoryCount: toNumber(metrics.category_count),
      invoiceCount: toNumber(metrics.invoice_count),
      latestTransactionAt: metrics.latest_transaction_at ?? null,
      netTotal: toNumber(metrics.net_total),
      recentExpenseCount: toNumber(metrics.recent_expense_count),
      recentIncomeCount: toNumber(metrics.recent_income_count),
      recentNetTotal: toNumber(metrics.recent_net_total),
      recentTotalExpense: toNumber(metrics.recent_total_expense),
      recentTotalIncome: toNumber(metrics.recent_total_income),
      recentTransactionCount: toNumber(metrics.recent_transaction_count),
      totalExpense: toNumber(metrics.total_expense),
      totalIncome: toNumber(metrics.total_income),
      transactionCount: toNumber(metrics.transaction_count),
      walletCount: toNumber(metrics.wallet_count),
    });
  } catch (error) {
    serverLogger.error('Error fetching finance overview metrics:', error);
    return NextResponse.json(
      { message: 'Failed to fetch finance overview metrics' },
      { status: 500 }
    );
  }
}
