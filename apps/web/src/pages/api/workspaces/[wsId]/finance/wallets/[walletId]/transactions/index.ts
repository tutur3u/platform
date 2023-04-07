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
    .select(
      'id, amount, created_at, taken_at, description, wallet_id, category_id, transaction_categories(name)'
    )
    .order('taken_at', { ascending: false })
    .eq('wallet_id', walletId);

  if (error) return res.status(401).json({ error: error.message });
  return res.status(200).json([
    ...data.map((transaction) => ({
      id: transaction.id,
      amount: transaction.amount,
      created_at: transaction.created_at,
      taken_at: transaction.taken_at,
      description:
        transaction?.description || transaction?.transaction_categories
          ? Array.isArray(transaction?.transaction_categories)
            ? transaction?.transaction_categories?.[0]?.name
            : transaction?.transaction_categories?.name
          : '',
      wallet_id: transaction.wallet_id,
      category_id: transaction.category_id,
    })),
  ] as Transaction[]);
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

  const { description, amount, taken_at, category_id } =
    req.body as Transaction;

  const { data, error } = await supabase
    .from('wallet_transactions')
    .insert({
      description,
      amount,
      category_id,
      taken_at,
      wallet_id: walletId,
    })
    .select('id')
    .single();

  if (error) return res.status(401).json({ error: error.message });
  return res.status(200).json({ id: data.id });
};
