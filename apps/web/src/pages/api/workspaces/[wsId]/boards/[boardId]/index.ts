import { createServerSupabaseClient } from '@supabase/auth-helpers-nextjs';
import type { NextApiRequest, NextApiResponse } from 'next';

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  try {
    const { boardId } = req.query;

    if (!boardId || typeof boardId !== 'string')
      throw new Error('Invalid boardId');

    switch (req.method) {
      case 'GET':
        return await fetchBoard(req, res, boardId);

      case 'PUT': {
        return await updateBoard(req, res, boardId);
      }

      case 'DELETE': {
        return await deleteBoard(req, res, boardId);
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

const fetchBoard = async (
  req: NextApiRequest,
  res: NextApiResponse,
  boardId: string
) => {
  const supabase = createServerSupabaseClient({ req, res });

  const { data, error } = await supabase
    .from('workspace_boards')
    .select('id, name')
    .eq('id', boardId)
    .single();

  if (error) return res.status(500).json({ error: error.message });
  if (!data) return res.status(404).json({ error: 'Not found' });

  return res.status(200).json(data);
};

const updateBoard = async (
  req: NextApiRequest,
  res: NextApiResponse,
  boardId: string
) => {
  const supabase = createServerSupabaseClient({
    req,
    res,
  });

  const { name } = req.body;

  const { error } = await supabase
    .from('workspace_boards')
    .update({
      name,
    })
    .eq('id', boardId);

  if (error) return res.status(401).json({ error: error.message });
  return res.status(200).json({});
};

const deleteBoard = async (
  req: NextApiRequest,
  res: NextApiResponse,
  boardId: string
) => {
  const supabase = createServerSupabaseClient({
    req,
    res,
  });

  const { error } = await supabase
    .from('workspace_boards')
    .delete()
    .eq('id', boardId);

  if (error) return res.status(401).json({ error: error.message });
  return res.status(200).json({});
};

export default handler;
