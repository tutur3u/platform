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

    // Batch fetch wallet currencies
    const uniqueWalletIds = [
      ...new Set(
        rawTransactions.map((t) => t.wallet_id).filter(Boolean) as string[]
      ),
    ];
    const walletCurrencyMap: Record<string, string> = {};
    if (uniqueWalletIds.length > 0) {
      const { data: walletCurrencies } = await supabase
        .from('workspace_wallets')
        .select('id, currency')
        .in('id', uniqueWalletIds);
      (walletCurrencies || []).forEach((w) => {
        if (w.currency) walletCurrencyMap[w.id] = w.currency;
      });
    }

    // Get transaction IDs for fetching tags
    const transactionIds = rawTransactions.map((t) => t.id);

    // Fetch tags for all transactions in a single query
    const { data: transactionTags } =
      transactionIds.length > 0
        ? await supabase
            .from('wallet_transaction_tags')
            .select('transaction_id, tag:transaction_tags(id, name, color)')
            .in('transaction_id', transactionIds)
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

    // Batch fetch transfer metadata for all transactions
    const transfersByTxId: Record<
      string,
      {
        linked_transaction_id: string;
        linked_wallet_id: string;
        linked_wallet_name: string;
        linked_wallet_currency?: string;
        linked_amount?: number;
        is_origin: boolean;
      }
    > = {};

    if (transactionIds.length > 0) {
      const { data: transferLinks } = await supabase
        .from('workspace_wallet_transfers')
        .select('from_transaction_id, to_transaction_id')
        .or(
          `from_transaction_id.in.(${transactionIds.join(',')}),to_transaction_id.in.(${transactionIds.join(',')})`
        );

      if (transferLinks && transferLinks.length > 0) {
        // Collect all linked transaction IDs we need to look up
        const linkedTxIds = new Set<string>();
        for (const link of transferLinks) {
          linkedTxIds.add(link.from_transaction_id);
          linkedTxIds.add(link.to_transaction_id);
        }

        // Fetch linked transactions with wallet info
        const { data: linkedTxs } = await supabase
          .from('wallet_transactions')
          .select('id, amount, wallet_id')
          .in('id', [...linkedTxIds]);

        // Build wallet name/currency map (reuse existing map + fetch missing)
        const allWalletIds = new Set(uniqueWalletIds);
        (linkedTxs || []).forEach((tx) => {
          if (tx.wallet_id) allWalletIds.add(tx.wallet_id);
        });

        const walletNameMap: Record<string, string> = {};
        // Fetch wallet names + currencies for all relevant wallets
        if (allWalletIds.size > 0) {
          const { data: walletDetails } = await supabase
            .from('workspace_wallets')
            .select('id, name, currency')
            .in('id', [...allWalletIds]);

          (walletDetails || []).forEach((w) => {
            walletNameMap[w.id] = w.name || '';
            if (w.currency && !walletCurrencyMap[w.id]) {
              walletCurrencyMap[w.id] = w.currency;
            }
          });
        }

        // Build lookup from transaction ID → wallet/amount
        const txLookup: Record<string, { amount: number; wallet_id: string }> =
          {};
        (linkedTxs || []).forEach((tx) => {
          txLookup[tx.id] = {
            amount: tx.amount ?? 0,
            wallet_id: tx.wallet_id,
          };
        });

        // Map each transfer link to both sides
        for (const link of transferLinks) {
          const fromId = link.from_transaction_id;
          const toId = link.to_transaction_id;
          const fromTx = txLookup[fromId];
          const toTx = txLookup[toId];

          if (fromTx && toTx) {
            // For from-transaction: linked to the to-transaction
            if (transactionIds.includes(fromId)) {
              transfersByTxId[fromId] = {
                linked_transaction_id: toId,
                linked_wallet_id: toTx.wallet_id,
                linked_wallet_name: walletNameMap[toTx.wallet_id] || '',
                linked_wallet_currency: walletCurrencyMap[toTx.wallet_id],
                linked_amount: toTx.amount,
                is_origin: true,
              };
            }
            // For to-transaction: linked to the from-transaction
            if (transactionIds.includes(toId)) {
              transfersByTxId[toId] = {
                linked_transaction_id: fromId,
                linked_wallet_id: fromTx.wallet_id,
                linked_wallet_name: walletNameMap[fromTx.wallet_id] || '',
                linked_wallet_currency: walletCurrencyMap[fromTx.wallet_id],
                linked_amount: fromTx.amount,
                is_origin: false,
              };
            }
          }
        }
      }
    }

    const transactions = rawTransactions.map((t) => ({
      ...t,
      wallet: t.wallet_name,
      wallet_currency: walletCurrencyMap[t.wallet_id] || undefined,
      category: t.category_name,
      category_icon: t.category_icon,
      category_color: t.category_color,
      user: {
        full_name: t.creator_full_name,
        email: t.creator_email,
        avatar_url: t.creator_avatar_url,
      },
      tags: tagsByTransaction[t.id] || [],
      transfer: transfersByTxId[t.id] || undefined,
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
