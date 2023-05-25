import { createPagesServerClient } from '@supabase/auth-helpers-nextjs';
import type { NextApiRequest, NextApiResponse } from 'next';
import { Transaction } from '../../../../../../types/primitives/Transaction';

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  try {
    const { wsId } = req.query;

    if (!wsId || typeof wsId !== 'string') throw new Error('Invalid wsId');

    switch (req.method) {
      case 'POST':
        return await createTransactions(req, res);

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

const createTransactions = async (
  req: NextApiRequest,
  res: NextApiResponse
) => {
  const supabase = createPagesServerClient({
    req,
    res,
  });

  const { transactions } = req.body as { transactions: Transaction[] };

  const { error } = await supabase.from('wallet_transactions').insert(
    transactions.map(
      ({ amount, category_id, description, taken_at, wallet_id }) => ({
        amount,
        category_id,
        description,
        taken_at,
        wallet_id,
      })
    )
  );

  if (error) return res.status(401).json({ error: error.message });
  return res.status(200).json({});
};
