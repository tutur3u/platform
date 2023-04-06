import { createServerSupabaseClient } from '@supabase/auth-helpers-nextjs';
import type { NextApiRequest, NextApiResponse } from 'next';
import { Wallet } from '../../../../../../types/primitives/Wallet';
import { Transaction } from '../../../../../../types/primitives/Transaction';

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  try {
    const { wsId } = req.query;

    if (!wsId || typeof wsId !== 'string') throw new Error('Invalid wsId');

    switch (req.method) {
      case 'GET':
        return await fetchWallets(req, res, wsId);

      case 'POST':
        return await createWallet(req, res, wsId);

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

const fetchWallets = async (
  req: NextApiRequest,
  res: NextApiResponse,
  wsId: string
) => {
  const supabase = createServerSupabaseClient({
    req,
    res,
  });

  const { blacklist, query, page, itemsPerPage } = req.query;

  const queryBuilder = supabase
    .from('workspace_wallets')
    .select('id, name, balance, currency, created_at')
    .order('created_at', { ascending: false })
    .eq('ws_id', wsId);

  if (blacklist && typeof blacklist === 'string') {
    queryBuilder.not('id', 'in', `(${blacklist})`);
  }

  if (query) {
    queryBuilder.ilike('name', `%${query}%`);
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
  return res.status(200).json(data);
};

const createWallet = async (
  req: NextApiRequest,
  res: NextApiResponse,
  wsId: string
) => {
  const supabase = createServerSupabaseClient({
    req,
    res,
  });

  const { name, description, balance, currency } = req.body as Wallet;

  const { data: wallet, error: walletError } = await supabase
    .from('workspace_wallets')
    .insert({
      name,
      description,
      currency,
      ws_id: wsId,
    })
    .select('id')
    .single();

  if (!wallet) return res.status(401).json({ error: walletError.message });

  if (balance && balance != 0) {
    const { error: transactionError } = await supabase
      .from('wallet_transactions')
      .insert({
        description: 'Initial deposit',
        amount: balance,
        is_expense: false,
        wallet_id: wallet.id,
      } as Transaction);

    if (transactionError)
      return res.status(401).json({ error: transactionError.message });
  }

  return res.status(200).json({});
};
