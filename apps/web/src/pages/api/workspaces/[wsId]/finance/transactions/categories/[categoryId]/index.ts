import { createPagesServerClient } from '@supabase/auth-helpers-nextjs';
import type { NextApiRequest, NextApiResponse } from 'next';

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  try {
    const { categoryId } = req.query;
    if (!categoryId || typeof categoryId !== 'string')
      throw new Error('Invalid ID');

    switch (req.method) {
      case 'GET':
        return await getCategory(req, res, categoryId);

      case 'PUT':
        return await updateCategory(req, res, categoryId);

      case 'DELETE':
        return await deleteCategory(req, res, categoryId);

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

const getCategory = async (
  req: NextApiRequest,
  res: NextApiResponse,
  categoryId: string
) => {
  const supabase = createPagesServerClient({
    req,
    res,
  });

  const { data, error } = await supabase
    .from('transaction_categories')
    .select('id, name, is_expense, created_at')
    .eq('id', categoryId)
    .single();

  if (error) return res.status(401).json({ error: error.message });
  return res.status(200).json(data);
};

const updateCategory = async (
  req: NextApiRequest,
  res: NextApiResponse,
  categoryId: string
) => {
  const supabase = createPagesServerClient({
    req,
    res,
  });

  const { name, is_expense } = req.body;

  const { error } = await supabase
    .from('transaction_categories')
    .update({
      name,
      is_expense,
    })
    .eq('id', categoryId);

  if (error) return res.status(401).json({ error: error.message });
  return res.status(200).json({});
};

const deleteCategory = async (
  req: NextApiRequest,
  res: NextApiResponse,
  categoryId: string
) => {
  const supabase = createPagesServerClient({
    req,
    res,
  });

  const { error } = await supabase
    .from('transaction_categories')
    .delete()
    .eq('id', categoryId);

  if (error) return res.status(401).json({ error: error.message });
  return res.status(200).json({});
};
