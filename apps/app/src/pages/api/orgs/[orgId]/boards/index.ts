import { createServerSupabaseClient } from '@supabase/auth-helpers-nextjs';
import type { NextApiRequest, NextApiResponse } from 'next';

const fetchBoards = async (
  req: NextApiRequest,
  res: NextApiResponse,
  orgId: string
) => {
  const supabase = createServerSupabaseClient({ req, res });

  const { data, error } = await supabase
    .from('task_boards')
    .select('id, name, created_at')
    .eq('org_id', orgId);

  if (error) return res.status(500).json({ error: error.message });

  return res.status(200).json(data);
};

const createBoard = async (
  req: NextApiRequest,
  res: NextApiResponse,
  orgId: string
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
    .insert({ org_id: orgId, name })
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
    const { orgId } = req.query;

    if (!orgId || typeof orgId !== 'string') throw new Error('Invalid orgId');

    switch (req.method) {
      case 'GET':
        return await fetchBoards(req, res, orgId);

      case 'POST':
        return await createBoard(req, res, orgId);

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
