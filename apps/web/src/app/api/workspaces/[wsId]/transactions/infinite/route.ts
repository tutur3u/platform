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
    const startDate = searchParams.get('start');
    const endDate = searchParams.get('end');

    // Parse and validate cursor for cursor-based pagination
    let cursorTakenAt = null;
    let cursorCreatedAt = null;
    if (cursor) {
      const parts = cursor.trim().split('_');
      if (parts.length !== 2 || !parts[0] || !parts[1]) {
        return NextResponse.json(
          { message: 'Invalid cursor format' },
          { status: 400 }
        );
      }

      const [taken_at, created_at] = parts;

      if (
        Number.isNaN(new Date(taken_at).getTime()) ||
        Number.isNaN(new Date(created_at).getTime())
      ) {
        return NextResponse.json(
          { message: 'Invalid cursor date format' },
          { status: 400 }
        );
      }

      cursorTakenAt = taken_at;
      cursorCreatedAt = created_at;
    }

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

    // Use optimized RPC function with all filters at database level
    const { data, error } = await supabase.rpc(
      'get_wallet_transactions_with_permissions',
      {
        p_ws_id: wsId,
        p_user_id: user.id, // Explicitly pass user ID
        p_wallet_ids: finalWalletIds,
        p_category_ids: categoryIds.length > 0 ? categoryIds : undefined,
        p_creator_ids: userIds.length > 0 ? userIds : undefined,
        p_search_query: q || undefined,
        p_start_date: startDate || undefined,
        p_end_date: endDate || undefined,
        p_order_by: 'taken_at',
        p_order_direction: 'DESC',
        p_limit: limit + 1, // Fetch one extra to check for more
        p_cursor_taken_at: cursorTakenAt || undefined,
        p_cursor_created_at: cursorCreatedAt || undefined,
        p_include_count: false, // Don't need total count for infinite scroll
      }
    );

    if (error) throw error;

    // Check if there are more results
    const hasMore = (data || []).length > limit;
    const rawTransactions = hasMore ? data.slice(0, limit) : data || [];

    const transactions = rawTransactions.map((t: any) => ({
      ...t,
      wallet: t.wallet_name,
      user: {
        full_name: t.creator_full_name,
        email: t.creator_email,
        avatar_url: t.creator_avatar_url,
      },
      // Remove flat fields to keep response clean (optional, keeping them doesn't hurt)
    }));

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
