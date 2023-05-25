import { createPagesServerClient } from '@supabase/auth-helpers-nextjs';
import type { NextApiRequest, NextApiResponse } from 'next';

const fetchTeam = async (
  req: NextApiRequest,
  res: NextApiResponse,
  teamId: string
) => {
  const supabase = createPagesServerClient({ req, res });

  const { data, error } = await supabase
    .from('workspace_teams')
    .select('id, name, created_at, workspaces(id, name)')
    .eq('id', teamId)
    .single();

  if (error) return res.status(500).json({ error: error.message });

  return res.status(200).json(data);
};

const updateTeam = async (
  req: NextApiRequest,
  res: NextApiResponse,
  teamId: string
) => {
  const supabase = createPagesServerClient({ req, res });

  const { name } = req.body;

  const { error } = await supabase
    .from('workspace_teams')
    .update({ name })
    .eq('id', teamId);

  if (error)
    return res.status(500).json({
      error: {
        message: 'Something went wrong',
      },
    });

  return res.status(200).json({});
};

const deleteTeam = async (
  req: NextApiRequest,
  res: NextApiResponse,
  teamId: string
) => {
  const supabase = createPagesServerClient({ req, res });

  const { error } = await supabase
    .from('workspace_teams')
    .delete()
    .eq('id', teamId);

  if (error)
    return res.status(500).json({
      error: {
        message: 'Something went wrong',
      },
    });

  return res.status(200).json({});
};

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  try {
    const { teamId } = req.query;

    if (!teamId || typeof teamId !== 'string')
      throw new Error('Invalid teamId');

    switch (req.method) {
      case 'GET':
        return await fetchTeam(req, res, teamId);

      case 'PUT':
        return await updateTeam(req, res, teamId);

      case 'DELETE':
        return await deleteTeam(req, res, teamId);

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
