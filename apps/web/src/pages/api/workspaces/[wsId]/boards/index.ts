import { createServerSupabaseClient } from '@supabase/auth-helpers-nextjs';
import type { NextApiRequest, NextApiResponse } from 'next';

const fetchBoards = async (
  req: NextApiRequest,
  res: NextApiResponse,
  wsId: string
) => {
  const supabase = createServerSupabaseClient({ req, res });

  const { data, error } = await supabase
    .from('task_boards')
    .select('id, name, created_at')
    .eq('ws_id', wsId);

  if (error) return res.status(500).json({ error: error.message });

  return res.status(200).json(data);
};

const createBoard = async (
  req: NextApiRequest,
  res: NextApiResponse,
  wsId: string
) => {
  const supabase = createServerSupabaseClient({ req, res });

  const { name } = req.body;

  if (!name)
    return res.status(400).json({
      error: {
        message: 'Invalid request',
      },
    });

  const { data, error } = await supabase
    .from('task_boards')
    .insert({ ws_id: wsId, name })
    .select('id')
    .single();

  if (error)
    return res.status(500).json({
      error: {
        message: 'Something went wrong',
      },
    });

  return res.status(200).json({ message: 'Board created', id: data.id });
};

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  try {
    const { wsId } = req.query;

    if (!wsId || typeof wsId !== 'string') throw new Error('Invalid wsId');

    switch (req.method) {
      case 'GET':
        return await fetchBoards(req, res, wsId);

      case 'POST':
        return await createBoard(req, res, wsId);

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
