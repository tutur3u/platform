import { createServerSupabaseClient } from '@supabase/auth-helpers-nextjs';
import type { NextApiRequest, NextApiResponse } from 'next';

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  try {
    switch (req.method) {
      case 'GET':
        return await fetchMembers(req, res);

      case 'POST':
        return await addMember(req, res);

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

const fetchMembers = async (req: NextApiRequest, res: NextApiResponse) => {
  const supabase = createServerSupabaseClient({
    req,
    res,
  });

  const { boardId } = req.query;
  if (!boardId) return res.status(401).json({ error: 'Invalid board ID' });

  const { data, error } = await supabase
    .from('task_board_members')
    .select('...users(id, display_name, handle)')
    .eq('board_id', boardId)
    .order('created_at');

  if (error) return res.status(401).json({ error: error.message });
  console.log(data);
  return res.status(200).json(data);
};

const addMember = async (req: NextApiRequest, res: NextApiResponse) => {
  const supabase = createServerSupabaseClient({
    req,
    res,
  });

  const { name } = req.body;

  const { data, error } = await supabase
    .from('task_boards')
    .insert({
      name,
    })
    .select('id')
    .single();

  if (error) return res.status(401).json({ error: error.message });
  return res.status(200).json(data);
};
