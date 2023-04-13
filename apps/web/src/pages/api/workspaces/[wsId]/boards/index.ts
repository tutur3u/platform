import { createServerSupabaseClient } from '@supabase/auth-helpers-nextjs';
import type { NextApiRequest, NextApiResponse } from 'next';

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  try {
    const { teamId } = req.query;

    if (!teamId || typeof teamId !== 'string')
      throw new Error('Invalid teamId');

    switch (req.method) {
      case 'GET':
        return await fetchBoards(req, res, teamId);

      case 'POST':
        return await createBoard(req, res, teamId);

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
  teamId: string
) => {
  const supabase = createServerSupabaseClient({
    req,
    res,
  });

  const { data, error } = await supabase
    .from('workspace_boards')
    .select('id, name')
    .eq('project_id', teamId)
    .order('created_at', { ascending: false });

  if (error) return res.status(401).json({ error: error.message });
  return res.status(200).json(data);
};

const createBoard = async (
  req: NextApiRequest,
  res: NextApiResponse,
  teamId: string
) => {
  const supabase = createServerSupabaseClient({
    req,
    res,
  });

  const { name } = req.body;

  const { data, error } = await supabase
    .from('workspace_boards')
    .insert({
      name,
      project_id: teamId,
    })
    .select('id')
    .single();

  if (error) return res.status(401).json({ error: error.message });
  return res.status(200).json({ id: data.id });
};
