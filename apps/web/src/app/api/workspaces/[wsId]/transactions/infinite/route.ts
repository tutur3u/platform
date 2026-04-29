import { resolveAuthenticatedSessionUser } from '@tuturuuu/supabase/next/auth-session-user';
import { createClient } from '@tuturuuu/supabase/next/server';
import { normalizeWorkspaceId } from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';

interface Params {
  params: Promise<{
    wsId: string;
  }>;
}

export async function GET(req: Request, { params }: Params) {
  try {
    const { wsId } = await params;
    const supabase = await createClient(req);
    const normalizedWsId = await normalizeWorkspaceId(wsId, supabase);
    const { searchParams } = new URL(req.url);

    const cursor = searchParams.get('cursor');
    const limit = parseInt(searchParams.get('limit') || '20', 10);
    const q = searchParams.get('q');
    const userIds = searchParams.getAll('userIds');
    const categoryIds = searchParams.getAll('categoryIds');
    const walletIds = searchParams.getAll('walletIds');
    const tagIds = searchParams.getAll('tagIds');
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
    const { user } = await resolveAuthenticatedSessionUser(supabase);

    if (!user) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    // Use optimized RPC function with all filters at database level
    const { data, error } = await supabase.rpc(
      'get_wallet_transactions_with_permissions',
      {
        p_ws_id: normalizedWsId,
        p_user_id: user.id, // Explicitly pass user ID
        p_wallet_ids: finalWalletIds,
        p_category_ids: categoryIds.length > 0 ? categoryIds : undefined,
        p_creator_ids: userIds.length > 0 ? userIds : undefined,
        p_tag_ids: tagIds.length > 0 ? tagIds : undefined,
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
    const transactionIds = rawTransactions.map((t) => t.id);
    const { data: enrichmentRows, error: enrichmentError } =
      transactionIds.length > 0
        ? await supabase.rpc('get_transaction_list_enrichment', {
            p_ws_id: normalizedWsId,
            p_transaction_ids: transactionIds,
            p_user_id: user.id,
          })
        : { data: [], error: null };

    if (enrichmentError) {
      throw enrichmentError;
    }

    const enrichmentByTransactionId = new Map<
      string,
      {
        wallet_currency: string | null;
        wallet_icon: string | null;
        wallet_image_src: string | null;
        tags: Array<{ id: string; name: string; color: string }>;
        transfer:
          | {
              linked_transaction_id: string;
              linked_wallet_id: string;
              linked_wallet_name: string;
              linked_wallet_currency?: string;
              linked_amount?: number;
              is_origin: boolean;
            }
          | undefined;
      }
    >();

    for (const row of enrichmentRows || []) {
      const tags = Array.isArray(row.tags)
        ? row.tags
            .filter(
              (
                tag
              ): tag is { id: string; name: string; color?: string | null } =>
                !!tag &&
                typeof tag === 'object' &&
                'id' in tag &&
                'name' in tag &&
                typeof tag.id === 'string' &&
                typeof tag.name === 'string'
            )
            .map((tag) => ({
              id: tag.id,
              name: tag.name,
              color: typeof tag.color === 'string' ? tag.color : '',
            }))
        : [];

      const transfer =
        row.transfer &&
        typeof row.transfer === 'object' &&
        'linked_transaction_id' in row.transfer &&
        'linked_wallet_id' in row.transfer &&
        'linked_wallet_name' in row.transfer
          ? {
              linked_transaction_id: String(row.transfer.linked_transaction_id),
              linked_wallet_id: String(row.transfer.linked_wallet_id),
              linked_wallet_name: String(row.transfer.linked_wallet_name),
              linked_wallet_currency:
                typeof row.transfer.linked_wallet_currency === 'string'
                  ? row.transfer.linked_wallet_currency
                  : undefined,
              linked_amount:
                typeof row.transfer.linked_amount === 'number'
                  ? row.transfer.linked_amount
                  : undefined,
              is_origin: Boolean(row.transfer.is_origin),
            }
          : undefined;

      enrichmentByTransactionId.set(row.transaction_id, {
        wallet_currency: row.wallet_currency,
        wallet_icon: row.wallet_icon,
        wallet_image_src: row.wallet_image_src,
        tags,
        transfer,
      });
    }

    const transactions = rawTransactions.map((t) => ({
      ...t,
      wallet: t.wallet_name,
      wallet_currency:
        enrichmentByTransactionId.get(t.id)?.wallet_currency || undefined,
      wallet_icon:
        enrichmentByTransactionId.get(t.id)?.wallet_icon || undefined,
      wallet_image_src:
        enrichmentByTransactionId.get(t.id)?.wallet_image_src || undefined,
      category: t.category_name,
      category_icon: t.category_icon,
      category_color: t.category_color,
      user: {
        full_name: t.creator_full_name,
        email: t.creator_email,
        avatar_url: t.creator_avatar_url,
      },
      tags: enrichmentByTransactionId.get(t.id)?.tags || [],
      transfer: enrichmentByTransactionId.get(t.id)?.transfer,
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
