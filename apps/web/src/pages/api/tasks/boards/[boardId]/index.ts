import { createPagesServerClient } from '@supabase/auth-helpers-nextjs';
import type { NextApiRequest, NextApiResponse } from 'next';

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  try {
    const { boardId } = req.query;
    if (!boardId || typeof boardId !== 'string') throw new Error('Invalid ID');

    switch (req.method) {
      case 'PUT':
        return await updateBoard(req, res, boardId);

      case 'DELETE':
        return await deleteBoard(req, res, boardId);

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

const updateBoard = async (
  req: NextApiRequest,
  res: NextApiResponse,
  boardId: string
) => {
  const supabase = createPagesServerClient({
    req,
    res,
  });

  const { name } = req.body;

  const data = {
    name,
  };

  const { error } = await supabase
    .from('task_boards')
    .update(data)
    .eq('id', boardId);

  if (error) return res.status(401).json({ error: error.message });
  return res.status(200).json({});
};

const deleteBoard = async (
  req: NextApiRequest,
  res: NextApiResponse,
  boardId: string
) => {
  const supabase = createPagesServerClient({
    req,
    res,
  });

  const { error } = await supabase
    .from('task_boards')
    .delete()
    .eq('id', boardId);

  if (error) return res.status(401).json({ error: error.message });
  return res.status(200).json({});
};
