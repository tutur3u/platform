import { createServerSupabaseClient } from '@supabase/auth-helpers-nextjs';
import type { NextApiRequest, NextApiResponse } from 'next';

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  try {
    const { transactionId } = req.query;
    if (!transactionId || typeof transactionId !== 'string')
      throw new Error('Invalid ID');

    switch (req.method) {
      case 'PUT':
        return await updateTransaction(req, res, transactionId);

      case 'DELETE':
        return await deleteTransaction(req, res, transactionId);

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

const updateTransaction = async (
  req: NextApiRequest,
  res: NextApiResponse,
  transactionId: string
) => {
  const supabase = createServerSupabaseClient({
    req,
    res,
  });

  const { description, amount } = req.body;

  const { error } = await supabase
    .from('wallet_transactions')
    .update({
      description,
      amount,
    })
    .eq('id', transactionId);

  if (error) return res.status(401).json({ error: error.message });
  return res.status(200).json({});
};

const deleteTransaction = async (
  req: NextApiRequest,
  res: NextApiResponse,
  transactionId: string
) => {
  const supabase = createServerSupabaseClient({
    req,
    res,
  });

  const { error } = await supabase
    .from('wallet_transactions')
    .delete()
    .eq('id', transactionId);

  if (error) return res.status(401).json({ error: error.message });
  return res.status(200).json({});
};
