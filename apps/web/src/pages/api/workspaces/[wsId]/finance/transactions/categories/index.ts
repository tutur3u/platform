import { createServerSupabaseClient } from '@supabase/auth-helpers-nextjs';
import type { NextApiRequest, NextApiResponse } from 'next';
import { TransactionCategory } from '../../../../../../../types/primitives/TransactionCategory';

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  try {
    const { wsId } = req.query;

    if (!wsId || typeof wsId !== 'string') throw new Error('Invalid wsId');

    switch (req.method) {
      case 'GET':
        return await fetchCategories(req, res, wsId);

      case 'POST':
        return await createCategory(req, res, wsId);

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

const fetchCategories = async (
  req: NextApiRequest,
  res: NextApiResponse,
  wsId: string
) => {
  const supabase = createServerSupabaseClient({
    req,
    res,
  });

  const { data, error } = await supabase
    .from('transaction_categories')
    .select('id, name, is_expense')
    .order('created_at')
    .eq('ws_id', wsId);

  if (error) return res.status(401).json({ error: error.message });
  return res.status(200).json(data);
};

const createCategory = async (
  req: NextApiRequest,
  res: NextApiResponse,
  wsId: string
) => {
  const supabase = createServerSupabaseClient({
    req,
    res,
  });

  const { name, is_expense } = req.body as TransactionCategory;

  const { error } = await supabase.from('transaction_categories').insert({
    name,
    is_expense,
    ws_id: wsId,
  });

  if (error) return res.status(401).json({ error: error.message });
  return res.status(200).json({});
};
