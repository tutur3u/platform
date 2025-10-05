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

    let queryBuilder = supabase
      .from('wallet_transactions')
      .select(
        `
        *,
        workspace_wallets!inner(name, ws_id),
        transaction_categories(name),
        workspace_users!wallet_transactions_creator_id_fkey(
          id,
          full_name,
          avatar_url,
          email
        )
      `
      )
      .eq('workspace_wallets.ws_id', wsId)
      .order('taken_at', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(limit + 1); // Fetch one extra to check if there's more

    // Apply cursor-based pagination
    if (cursor) {
      const [taken_at, created_at] = cursor.split('_');
      queryBuilder = queryBuilder.or(
        `taken_at.lt.${taken_at},and(taken_at.eq.${taken_at},created_at.lt.${created_at})`
      );
    }

    // Apply filters
    if (q) {
      queryBuilder.ilike('description', `%${q}%`);
    }

    if (userIds.length > 0) {
      queryBuilder.in('creator_id', userIds);
    }

    if (categoryIds.length > 0) {
      queryBuilder.in('category_id', categoryIds);
    }

    if (walletIds.length > 0) {
      queryBuilder.in('wallet_id', walletIds);
    } else if (walletId) {
      queryBuilder.eq('wallet_id', walletId);
    }

    const { data: rawData, error } = await queryBuilder;

    if (error) throw error;

    // Check if there are more items
    const hasMore = rawData.length > limit;
    const data = hasMore ? rawData.slice(0, limit) : rawData;

    // Generate next cursor
    let nextCursor = null;
    if (hasMore && data.length > 0) {
      const lastItem = data[data.length - 1];
      nextCursor = `${lastItem?.taken_at}_${lastItem?.created_at}`;
    }

    // Transform data
    const transactions = data.map(
      ({
        workspace_wallets,
        transaction_categories,
        workspace_users,
        ...rest
      }) => ({
        ...rest,
        wallet: workspace_wallets?.name,
        category: transaction_categories?.name,
        creator: workspace_users,
      })
    );

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
