import { createServerSupabaseClient } from '@supabase/auth-helpers-nextjs';
import type { NextApiRequest, NextApiResponse } from 'next';

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  try {
    const { categoryId } = req.query;

    if (!categoryId || typeof categoryId !== 'string')
      throw new Error('Invalid categoryId');

    switch (req.method) {
      case 'GET':
        return await fetchCategory(req, res, categoryId);

      case 'PUT': {
        return await updateCategory(req, res, categoryId);
      }

      case 'DELETE': {
        return await deleteCategory(req, res, categoryId);
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

const fetchCategory = async (
  req: NextApiRequest,
  res: NextApiResponse,
  categoryId: string
) => {
  const supabase = createServerSupabaseClient({ req, res });

  const { data, error } = await supabase
    .from('workspaces_categories')
    .select('id, name, description')
    .eq('id', categoryId)
    .single();

  if (error) return res.status(500).json({ error: error.message });
  if (!data) return res.status(404).json({ error: 'Not found' });

  return res.status(200).json(data);
};

const updateCategory = async (
  req: NextApiRequest,
  res: NextApiResponse,
  categoryId: string
) => {
  const supabase = createServerSupabaseClient({
    req,
    res,
  });

  const { name, description } = req.body;

  const { error } = await supabase
    .from('workspac')
    .update({
      name,
      description,
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
  const supabase = createServerSupabaseClient({
    req,
    res,
  });

  const { error } = await supabase
    .from('workspac')
    .delete()
    .eq('id', categoryId);

  if (error) return res.status(401).json({ error: error.message });
  return res.status(200).json({});
};

export default handler;
