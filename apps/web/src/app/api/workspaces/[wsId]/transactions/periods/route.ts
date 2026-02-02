import { createClient } from '@tuturuuu/supabase/next/server';
import type {
  Transaction,
  TransactionPeriod,
  TransactionViewMode,
} from '@tuturuuu/types/primitives';
import { NextResponse } from 'next/server';

interface Params {
  params: Promise<{
    wsId: string;
  }>;
}

// Raw transaction data from the RPC (database structure)
interface RawTransaction {
  id: string;
  amount: number;
  description: string | null;
  category_id: string | null;
  category: string | null;
  category_icon: string | null;
  category_color: string | null;
  wallet_id: string | null;
  wallet: string | null;
  ws_id: string;
  taken_at: string;
  is_amount_confidential: boolean;
  is_description_confidential: boolean;
  is_category_confidential: boolean;
  report_opt_in: boolean;
  created_at: string;
  creator_id: string | null;
  platform_creator_id: string | null;
}

interface RawPeriodResult {
  period_start: string;
  period_end: string;
  total_income: number;
  total_expense: number;
  net_total: number;
  transaction_count: number;
  has_redacted_amounts: boolean;
  transactions: RawTransaction[];
  has_more: boolean;
}

export async function GET(req: Request, { params }: Params) {
  try {
    const { wsId } = await params;
    const supabase = await createClient();
    const { searchParams } = new URL(req.url);

    const viewMode = (searchParams.get('viewMode') ||
      'weekly') as TransactionViewMode;
    const cursor = searchParams.get('cursor');
    const limit = parseInt(searchParams.get('limit') || '10', 10);
    const q = searchParams.get('q');
    const userIds = searchParams.getAll('userIds');
    const categoryIds = searchParams.getAll('categoryIds');
    const walletIds = searchParams.getAll('walletIds');
    const tagIds = searchParams.getAll('tagIds');
    const walletId = searchParams.get('walletId');
    const startDate = searchParams.get('start');
    const endDate = searchParams.get('end');

    // Combine wallet filters
    const finalWalletIds =
      walletIds.length > 0 ? walletIds : walletId ? [walletId] : undefined;

    // Get current user
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    // Call the RPC function
    const { data, error } = await supabase.rpc('get_transactions_by_period', {
      p_ws_id: wsId,
      p_interval: viewMode,
      p_user_id: user.id,
      p_wallet_ids: finalWalletIds,
      p_category_ids: categoryIds.length > 0 ? categoryIds : undefined,
      p_creator_ids: userIds.length > 0 ? userIds : undefined,
      p_tag_ids: tagIds.length > 0 ? tagIds : undefined,
      p_search_query: q || undefined,
      p_start_date: startDate || undefined,
      p_end_date: endDate || undefined,
      p_cursor_period_start: cursor || undefined,
      p_limit: limit,
    });

    if (error) throw error;

    const rawResults = (data || []) as unknown as RawPeriodResult[];

    // Check if there are more results
    const hasMore = rawResults.length > 0 && rawResults[0]?.has_more;

    // Collect all transaction IDs for tag fetching
    const allTransactionIds: string[] = [];
    rawResults.forEach((period) => {
      if (period.transactions && Array.isArray(period.transactions)) {
        period.transactions.forEach((tx: RawTransaction) => {
          if (tx.id) allTransactionIds.push(tx.id);
        });
      }
    });

    // Fetch tags for all transactions in a single query
    const { data: transactionTags } =
      allTransactionIds.length > 0
        ? await supabase
            .from('wallet_transaction_tags')
            .select('transaction_id, tag:transaction_tags(id, name, color)')
            .in('transaction_id', allTransactionIds)
        : { data: [] };

    // Group tags by transaction ID
    const tagsByTransaction: Record<
      string,
      Array<{ id: string; name: string; color: string }>
    > = {};
    (transactionTags || []).forEach((tt: any) => {
      if (!tagsByTransaction[tt.transaction_id]) {
        tagsByTransaction[tt.transaction_id] = [];
      }
      if (tt.tag) {
        tagsByTransaction[tt.transaction_id]!.push(tt.tag);
      }
    });

    // Collect all creator IDs for user info fetching
    const creatorIds = new Set<string>();
    rawResults.forEach((period) => {
      if (period.transactions && Array.isArray(period.transactions)) {
        period.transactions.forEach((tx: RawTransaction) => {
          if (tx.creator_id) creatorIds.add(tx.creator_id);
          if (tx.platform_creator_id) creatorIds.add(tx.platform_creator_id);
        });
      }
    });

    // Fetch user info for all creators
    const userInfoMap: Record<
      string,
      { full_name?: string; email?: string; avatar_url?: string }
    > = {};

    if (creatorIds.size > 0) {
      const creatorIdsArray = Array.from(creatorIds);

      // Fetch platform users
      const { data: platformUsers } = await supabase
        .from('users')
        .select('id, display_name, avatar_url')
        .in('id', creatorIdsArray);

      const { data: platformUserDetails } = await supabase
        .from('user_private_details')
        .select('user_id, full_name, email')
        .in('user_id', creatorIdsArray);

      // Fetch workspace users
      const { data: workspaceUsers } = await supabase
        .from('workspace_users')
        .select('id, full_name, email, avatar_url')
        .in('id', creatorIdsArray);

      // Build user info map
      platformUsers?.forEach((u) => {
        userInfoMap[u.id] = {
          full_name: u.display_name || undefined,
          avatar_url: u.avatar_url || undefined,
        };
      });

      platformUserDetails?.forEach((d) => {
        if (!userInfoMap[d.user_id]) userInfoMap[d.user_id] = {};
        userInfoMap[d.user_id]!.full_name =
          userInfoMap[d.user_id]!.full_name || d.full_name || undefined;
        userInfoMap[d.user_id]!.email = d.email || undefined;
      });

      workspaceUsers?.forEach((wu) => {
        if (!userInfoMap[wu.id]) userInfoMap[wu.id] = {};
        userInfoMap[wu.id]!.full_name =
          userInfoMap[wu.id]!.full_name || wu.full_name || undefined;
        userInfoMap[wu.id]!.email =
          userInfoMap[wu.id]!.email || wu.email || undefined;
        userInfoMap[wu.id]!.avatar_url =
          userInfoMap[wu.id]!.avatar_url || wu.avatar_url || undefined;
      });
    }

    // Transform the results
    const periods: TransactionPeriod[] = rawResults.map((period) => {
      const transactions: Transaction[] = (period.transactions || []).map(
        (tx: RawTransaction) => {
          const creatorId = tx.creator_id || tx.platform_creator_id;
          const userInfo = creatorId ? userInfoMap[creatorId] : undefined;

          return {
            id: tx.id,
            amount: tx.amount,
            description: tx.description || undefined,
            category_id: tx.category_id || undefined,
            category: tx.category || undefined,
            category_icon: tx.category_icon,
            category_color: tx.category_color,
            wallet_id: tx.wallet_id || undefined,
            wallet: tx.wallet || undefined,
            ws_id: tx.ws_id,
            taken_at: tx.taken_at,
            is_amount_confidential: tx.is_amount_confidential,
            is_description_confidential: tx.is_description_confidential,
            is_category_confidential: tx.is_category_confidential,
            report_opt_in: tx.report_opt_in,
            created_at: tx.created_at,
            user: userInfo
              ? {
                  full_name: userInfo.full_name,
                  email: userInfo.email,
                  avatar_url: userInfo.avatar_url,
                }
              : undefined,
            tags: tagsByTransaction[tx.id] || [],
          };
        }
      );

      return {
        periodStart: period.period_start,
        periodEnd: period.period_end,
        periodLabel: '', // Will be generated on the client side based on locale
        totalIncome: Number(period.total_income) || 0,
        totalExpense: Number(period.total_expense) || 0,
        netTotal: Number(period.net_total) || 0,
        transactionCount: Number(period.transaction_count) || 0,
        hasRedactedAmounts: period.has_redacted_amounts || false,
        transactions,
      };
    });

    // Generate next cursor from the last period
    let nextCursor: string | null = null;
    if (hasMore && periods.length > 0) {
      const lastPeriod = periods[periods.length - 1];
      nextCursor = lastPeriod?.periodStart || null;
    }

    return NextResponse.json({
      data: periods,
      nextCursor,
      hasMore,
    });
  } catch (error) {
    console.error('Error fetching transaction periods:', error);
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : 'Failed to fetch transaction periods',
      },
      { status: 500 }
    );
  }
}
