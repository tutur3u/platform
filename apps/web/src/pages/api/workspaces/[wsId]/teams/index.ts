import { createPagesServerClient } from '@supabase/auth-helpers-nextjs';
import type { NextApiRequest, NextApiResponse } from 'next';

const fetchProjects = async (
  req: NextApiRequest,
  res: NextApiResponse,
  wsId: string
) => {
  const supabase = createPagesServerClient({ req, res });

  const { data, error } = await supabase
    .from('workspace_teams')
    .select('id, name, created_at')
    .eq('ws_id', wsId)
    .order('created_at', { ascending: false });

  if (error) return res.status(500).json({ error: error.message });

  return res.status(200).json(data);
};

const createProject = async (
  req: NextApiRequest,
  res: NextApiResponse,
  wsId: string
) => {
  const supabase = createPagesServerClient({ req, res });

  const { name } = req.body;

  const { data, error } = await supabase
    .from('workspace_teams')
    .insert({ ws_id: wsId, name })
    .select('id')
    .single();

  if (error)
    return res.status(500).json({
      error: {
        message: 'Something went wrong',
      },
    });

  return res.status(200).json({ message: 'Project created', id: data.id });
};

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  try {
    const { wsId } = req.query;

    if (!wsId || typeof wsId !== 'string') throw new Error('Invalid wsId');

    switch (req.method) {
      case 'GET':
        return await fetchProjects(req, res, wsId);

      case 'POST':
        return await createProject(req, res, wsId);

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
