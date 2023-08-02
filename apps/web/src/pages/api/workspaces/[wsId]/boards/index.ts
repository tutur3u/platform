import { createPagesServerClient } from '@supabase/auth-helpers-nextjs';
import type { NextApiRequest, NextApiResponse } from 'next';

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

const fetchBoards = async (
  req: NextApiRequest,
  res: NextApiResponse,
  wsId: string
) => {
  const supabase = createPagesServerClient({
    req,
    res,
  });

  const { data, error } = await supabase
    .from('workspace_boards')
    .select('id, name')
    .eq('ws_id', wsId)
    .order('created_at', { ascending: false });

  if (error) return res.status(401).json({ error: error.message });
  return res.status(200).json(data);
};

const createBoard = async (
  req: NextApiRequest,
  res: NextApiResponse,
  wsId: string
) => {
  const supabase = createPagesServerClient({
    req,
    res,
  });

  const { name } = req.body;

  const { data, error } = await supabase
    .from('workspace_boards')
    .insert({
      name,
      ws_id: wsId,
    })
    .select('id')
    .single();

  if (error) return res.status(401).json({ error: error.message });
  return res.status(200).json({ id: data.id });
};
