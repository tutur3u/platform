import { createServerSupabaseClient } from '@supabase/auth-helpers-nextjs';
import type { NextApiRequest, NextApiResponse } from 'next';
import { Transaction } from '../../../../../../../../types/primitives/Transaction';

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  try {
    const { walletId } = req.query;

    if (!walletId || typeof walletId !== 'string')
      throw new Error('Invalid walletId');

    switch (req.method) {
      case 'GET':
        return await fetchTransactions(req, res, walletId);

      case 'POST':
        return await createTransaction(req, res, walletId);

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
  walletId: string
) => {
  const supabase = createServerSupabaseClient({
    req,
    res,
  });

  const { data, error } = await supabase
    .from('wallet_transactions')
    .select('id, amount, created_at, description, wallet_id, category_id')
    .order('created_at')
    .eq('wallet_id', walletId);

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

  const { description, amount, category_id } = req.body as Transaction;

  const { error } = await supabase.from('wallet_transactions').insert({
    description,
    amount,
    category_id,
    wallet_id: walletId,
  });

  if (error) return res.status(401).json({ error: error.message });
  return res.status(200).json({ message: 'Transaction created' });
};
