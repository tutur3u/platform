import { createServerSupabaseClient } from '@supabase/auth-helpers-nextjs';
import type { NextApiRequest, NextApiResponse } from 'next';

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  try {
    switch (req.method) {
      case 'GET':
        return await fetchLists(req, res);

      case 'POST':
        return await createList(req, res);

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

const fetchLists = async (req: NextApiRequest, res: NextApiResponse) => {
  const supabase = createServerSupabaseClient({
    req,
    res,
  });

  const { boardId } = req.query;
  if (!boardId) return res.status(401).json({ error: 'Invalid board ID' });

  const { data, error } = await supabase
    .from('task_lists')
    .select('id, name')
    .eq('board_id', boardId)
    .order('created_at', { ascending: false });

  if (error) return res.status(401).json({ error: error.message });
  return res.status(200).json(data);
};

const createList = async (req: NextApiRequest, res: NextApiResponse) => {
  const supabase = createServerSupabaseClient({
    req,
    res,
  });

  const { name, boardId } = req.body;

  const { error } = await supabase
    .from('task_lists')
    .insert({
      name,
      board_id: boardId,
    })
    .single();

  if (error) return res.status(401).json({ error: error.message });
  return res.status(200).json({});
};
