import { createServerSupabaseClient } from '@supabase/auth-helpers-nextjs';
import type { NextApiRequest, NextApiResponse } from 'next';

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  try {
    const { listId } = req.query;
    if (!listId || typeof listId !== 'string') throw new Error('Invalid ID');

    switch (req.method) {
      case 'PUT':
        return await updateList(req, res, listId);

      case 'DELETE':
        return await deleteList(req, res, listId);

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

const updateList = async (
  req: NextApiRequest,
  res: NextApiResponse,
  listId: string
) => {
  const supabase = createServerSupabaseClient({
    req,
    res,
  });

  const { name } = req.body;

  const data = {
    name,
  };

  const { error } = await supabase
    .from('task_lists')
    .update(data)
    .eq('id', listId);

  if (error) return res.status(401).json({ error: error.message });
  return res.status(200).json({});
};

const deleteList = async (
  req: NextApiRequest,
  res: NextApiResponse,
  listId: string
) => {
  const supabase = createServerSupabaseClient({
    req,
    res,
  });

  const { error } = await supabase.from('task_lists').delete().eq('id', listId);

  if (error) return res.status(401).json({ error: error.message });
  return res.status(200).json({});
};
