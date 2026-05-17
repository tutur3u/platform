import { getFinanceRouteContext } from '@tuturuuu/apis/finance/request-access';
import {
  MAX_COLOR_LENGTH,
  MAX_LONG_TEXT_LENGTH,
  MAX_SEARCH_LENGTH,
} from '@tuturuuu/utils/constants';
import { NextResponse } from 'next/server';
import { z } from 'zod';

const querySchema = z.object({
  q: z.string().max(MAX_SEARCH_LENGTH).optional().nullable(),
  userIds: z.array(z.string()).optional().default([]),
  categoryIds: z.array(z.string()).optional().default([]),
  walletIds: z.array(z.string()).optional().default([]),
  tagIds: z.array(z.string()).optional().default([]),
  transactionType: z.enum(['income', 'expense']).optional().nullable(),
  walletId: z.string().max(MAX_LONG_TEXT_LENGTH).optional().nullable(),
  start: z.string().max(MAX_COLOR_LENGTH).optional().nullable(),
  end: z.string().max(MAX_COLOR_LENGTH).optional().nullable(),
});

interface Params {
  params: Promise<{
    wsId: string;
  }>;
}

export async function GET(
  req: Request,
  { params }: Params
): Promise<NextResponse> {
  try {
    const { wsId } = await params;
    const access = await getFinanceRouteContext(req, wsId);

    if (access.response) {
      return access.response;
    }

    const { normalizedWsId, permissions, supabase, user } = access.context;
    const { searchParams } = new URL(req.url);

    // Validate query parameters
    const parsed = querySchema.safeParse({
      q: searchParams.get('q'),
      userIds: searchParams.getAll('userIds'),
      categoryIds: searchParams.getAll('categoryIds'),
      walletIds: searchParams.getAll('walletIds'),
      tagIds: searchParams.getAll('tagIds'),
      transactionType: searchParams.get('transactionType'),
      walletId: searchParams.get('walletId'),
      start: searchParams.get('start'),
      end: searchParams.get('end'),
    });

    if (!parsed.success) {
      return NextResponse.json(
        { message: 'Invalid query parameters' },
        { status: 400 }
      );
    }

    const {
      q,
      userIds,
      categoryIds,
      walletIds,
      tagIds,
      transactionType,
      walletId,
      start: startDate,
      end: endDate,
    } = parsed.data;

    // Combine wallet filters
    const finalWalletIds =
      walletIds.length > 0 ? walletIds : walletId ? [walletId] : undefined;

    const { withoutPermission } = permissions;
    if (withoutPermission('view_transactions')) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 403 });
    }

    // Use dedicated RPC for stats
    const { data, error } = await supabase.rpc('get_transaction_stats', {
      p_ws_id: normalizedWsId,
      p_user_id: user.id,
      p_wallet_ids: finalWalletIds,
      p_category_ids: categoryIds.length > 0 ? categoryIds : undefined,
      p_creator_ids: userIds.length > 0 ? userIds : undefined,
      p_tag_ids: tagIds.length > 0 ? tagIds : undefined,
      p_transaction_type: transactionType || undefined,
      p_search_query: q || undefined,
      p_start_date: startDate || undefined,
      p_end_date: endDate || undefined,
    });

    if (error) throw error;

    const stats = data?.[0] || {
      total_transactions: 0,
      total_income: 0,
      total_expense: 0,
      net_total: 0,
      has_redacted_amounts: false,
    };

    return NextResponse.json({
      totalTransactions: Number(stats.total_transactions),
      totalIncome: Number(stats.total_income),
      totalExpense: Number(stats.total_expense),
      netTotal: Number(stats.net_total),
      hasRedactedAmounts: Boolean(stats.has_redacted_amounts),
    });
  } catch (error) {
    console.error('Error fetching transaction stats:', error);
    return NextResponse.json(
      {
        message: 'Internal server error while fetching transaction stats',
      },
      { status: 500 }
    );
  }
}
