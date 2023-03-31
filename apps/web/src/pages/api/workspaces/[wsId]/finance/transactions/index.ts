import { createServerSupabaseClient } from '@supabase/auth-helpers-nextjs';
import type { NextApiRequest, NextApiResponse } from 'next';

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  try {
    const { wsId, walletId } = req.query;

    if (!wsId || typeof wsId !== 'string') throw new Error('Invalid wsId');

    switch (req.method) {
      case 'GET':
        return await fetchTransactions(req, res, wsId);

      case 'POST': {
        if (!walletId || typeof walletId !== 'string')
          throw new Error('Invalid walletId');

        return await createTransaction(req, res, walletId);
      }

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

  const { data, error } = await supabase
    .from('wallet_transactions')
    .select(
      // 'id, name, description, amount, transaction_categories!inner(name, ws_id)'
      'id, name, description, amount, workspace_wallets!inner(ws_id)'
    )
    .order('created_at')
    .eq('workspace_wallets.ws_id', wsId);

  if (error) return res.status(401).json({ error: error.message });
  return res.status(200).json(data);
};

const createTransaction = async (
  req: NextApiRequest,
  res: NextApiResponse,
  walletId: string
) => {
  const supabase = createServerSupabaseClient({
    req,
    res,
  });

  const { name, description, balance, currency } = JSON.parse(req.body);

  const { error } = await supabase.from('wallet_transactions').insert({
    name,
    description,
    balance,
    currency,
    walletId,
  });

  if (error) return res.status(401).json({ error: error.message });
  return res.status(200).json({});
};
