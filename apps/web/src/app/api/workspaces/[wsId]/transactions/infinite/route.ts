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

    const cursor = searchParams.get('cursor');
    const limit = parseInt(searchParams.get('limit') || '20', 10);
    const q = searchParams.get('q');
    const userIds = searchParams.getAll('userIds');
    const categoryIds = searchParams.getAll('categoryIds');
    const walletIds = searchParams.getAll('walletIds');
    const walletId = searchParams.get('walletId'); // For single wallet view

    // Parse cursor for cursor-based pagination
    let cursorTakenAt = null;
    let cursorCreatedAt = null;
    if (cursor) {
      const [taken_at, created_at] = cursor.split('_');
      cursorTakenAt = taken_at;
      cursorCreatedAt = created_at;
    }

    // Combine wallet filters
    const finalWalletIds =
      walletIds.length > 0 ? walletIds : walletId ? [walletId] : null;

    // Use optimized RPC function with all filters at database level
    const { data, error } = await supabase.rpc(
      'get_wallet_transactions_with_permissions',
      {
        p_ws_id: wsId,
        p_wallet_ids: finalWalletIds,
        p_category_ids: categoryIds.length > 0 ? categoryIds : null,
        p_creator_ids: userIds.length > 0 ? userIds : null,
        p_search_query: q || null,
        p_order_by: 'taken_at',
        p_order_direction: 'DESC',
        p_limit: limit + 1, // Fetch one extra to check for more
        p_cursor_taken_at: cursorTakenAt,
        p_cursor_created_at: cursorCreatedAt,
        p_include_count: false, // Don't need total count for infinite scroll
      }
    );

    if (error) throw error;

    // Check if there are more results
    const hasMore = (data || []).length > limit;
    const transactions = hasMore ? data.slice(0, limit) : data || [];

    // Generate next cursor
    let nextCursor = null;
    if (hasMore && transactions.length > 0) {
      const lastItem = transactions[transactions.length - 1];
      nextCursor = `${lastItem?.taken_at}_${lastItem?.created_at}`;
    }

    return NextResponse.json({
      data: transactions,
      nextCursor,
      hasMore,
    });
  } catch (error) {
    console.error('Error fetching transactions:', error);
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : 'Failed to fetch transactions',
      },
      { status: 500 }
    );
  }
}
