import { createPagesServerClient } from '@supabase/auth-helpers-nextjs';
import type { NextApiRequest, NextApiResponse } from 'next';

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  try {
    switch (req.method) {
      case 'GET':
        return await fetchBoards(req, res);

      case 'POST':
        return await createBoard(req, res);

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

const fetchBoards = async (req: NextApiRequest, res: NextApiResponse) => {
  const supabase = createPagesServerClient({
    req,
    res,
  });

  const { data, error } = await supabase
    .from('task_board_members')
    .select('task_boards(id, name)')
    .order('created_at', { ascending: false });

  if (error) return res.status(401).json({ error: error.message });
  return res.status(200).json(data.map((board) => board.task_boards));
};

const createBoard = async (req: NextApiRequest, res: NextApiResponse) => {
  const supabase = createPagesServerClient({
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
