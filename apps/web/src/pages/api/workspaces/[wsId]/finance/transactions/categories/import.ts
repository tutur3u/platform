import { createServerSupabaseClient } from '@supabase/auth-helpers-nextjs';
import type { NextApiRequest, NextApiResponse } from 'next';
import { TransactionCategory } from '../../../../../../../types/primitives/TransactionCategory';

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  try {
    const { wsId } = req.query;

    if (!wsId || typeof wsId !== 'string') throw new Error('Invalid wsId');

    switch (req.method) {
      case 'POST':
        return await createCategories(req, res, wsId);

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

const createCategories = async (
  req: NextApiRequest,
  res: NextApiResponse,
  wsId: string
) => {
  const supabase = createServerSupabaseClient({
    req,
    res,
  });

  const { categories } = req.body as { categories: TransactionCategory[] };

  const { data, error } = await supabase
    .from('transaction_categories')
    .insert(
      categories.map(({ name, is_expense }) => ({
        name,
        is_expense,
        ws_id: wsId,
      }))
    )
    .select('id, name');

  if (error) return res.status(401).json({ error: error.message });
  return res.status(200).json(data);
};
