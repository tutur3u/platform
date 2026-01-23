import { createClient } from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';

interface Params {
  params: Promise<{
    wsId: string;
  }>;
}

export async function GET(req: Request, { params }: Params) {
  try {
    const { wsId } = await params;
    const supabase = await createClient();
    const { searchParams } = new URL(req.url);

    const q = searchParams.get('q');
    const userIds = searchParams.getAll('userIds');
    const categoryIds = searchParams.getAll('categoryIds');
    const walletIds = searchParams.getAll('walletIds');
    const walletId = searchParams.get('walletId');
    const startDate = searchParams.get('start');
    const endDate = searchParams.get('end');

    // Combine wallet filters
    const finalWalletIds =
      walletIds.length > 0 ? walletIds : walletId ? [walletId] : undefined;

    // Get current user to pass to RPC
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    // Use dedicated RPC for stats
    const { data, error } = await supabase.rpc('get_transaction_stats', {
      p_ws_id: wsId,
      p_user_id: user.id,
      p_wallet_ids: finalWalletIds,
      p_category_ids: categoryIds.length > 0 ? categoryIds : undefined,
      p_creator_ids: userIds.length > 0 ? userIds : undefined,
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
        message:
          error instanceof Error
            ? error.message
            : 'Failed to fetch transaction stats',
      },
      { status: 500 }
    );
  }
}
