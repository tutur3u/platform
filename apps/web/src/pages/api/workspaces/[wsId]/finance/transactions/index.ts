import { createServerSupabaseClient } from '@supabase/auth-helpers-nextjs';
import type { NextApiRequest, NextApiResponse } from 'next';
import { Transaction } from '../../../../../../types/primitives/Transaction';

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  try {
    const { wsId } = req.query;

    if (!wsId || typeof wsId !== 'string') throw new Error('Invalid wsId');

    switch (req.method) {
      case 'GET':
        return await fetchTransactions(req, res, wsId);

      default:
        throw new Error(
          `The HTTP ${req.method} method is not supported at this route.`
        );
    }
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      error: {
        message: 'Something went wrong',
      },
    });
  }
};

export default handler;

const fetchTransactions = async (
  req: NextApiRequest,
  res: NextApiResponse,
  wsId: string
) => {
  const supabase = createServerSupabaseClient({
    req,
    res,
  });

  const { walletIds, query, page, itemsPerPage } = req.query;

  const queryBuilder = supabase
    .from('wallet_transactions')
    .select(
      'id, description, amount, category_id, wallet_id, taken_at, created_at, transaction_categories(name), workspace_wallets!inner(ws_id)'
    )
    .order('taken_at', { ascending: false })
    .eq('workspace_wallets.ws_id', wsId);

  if (walletIds && typeof walletIds === 'string') {
    queryBuilder.in('wallet_id', walletIds.split(','));
  }

  if (query) {
    queryBuilder.ilike('description', `%${query}%`);
  }

  if (
    page &&
    itemsPerPage &&
    typeof page === 'string' &&
    typeof itemsPerPage === 'string'
  ) {
    const parsedPage = parseInt(page);
    const parsedSize = parseInt(itemsPerPage);

    const start = (parsedPage - 1) * parsedSize;
    const end = parsedPage * parsedSize;

    queryBuilder.range(start, end).limit(parsedSize);
  }

  const { data, error } = await queryBuilder;

  if (error) return res.status(401).json({ error: error.message });
  return res.status(200).json([
    ...data.map((transaction) => ({
      id: transaction.id,
      amount: transaction.amount,
      created_at: transaction.created_at,
      taken_at: transaction.taken_at,
      description:
        transaction?.description ||
        (transaction?.transaction_categories
          ? Array.isArray(transaction?.transaction_categories)
            ? transaction?.transaction_categories?.[0]?.name
            : transaction?.transaction_categories?.name
          : ''),
      wallet_id: transaction.wallet_id,
      category_id: transaction.category_id,
    })),
  ] as Transaction[]);
};
