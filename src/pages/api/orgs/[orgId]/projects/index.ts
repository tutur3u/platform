import { createServerSupabaseClient } from '@supabase/auth-helpers-nextjs';
import type { NextApiRequest, NextApiResponse } from 'next';

const fetchProjects = async (
  req: NextApiRequest,
  res: NextApiResponse,
  orgId: string
) => {
  const supabase = createServerSupabaseClient({ req, res });

  const { data, error } = await supabase
    .from('projects')
    .select('id, name, created_at')
    .eq('org_id', orgId);

  if (error) return res.status(500).json({ error: error.message });

  return res.status(200).json(data);
};

const createProject = async (
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

  const { error } = await supabase
    .from('projects')
    .insert({ org_id: orgId, name });

  if (error)
    return res.status(500).json({
      error: {
        message: 'Something went wrong',
      },
    });

  return res.status(200).json({ message: 'Project created' });
};

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  try {
    const { orgId } = req.query;

    if (!orgId || typeof orgId !== 'string') throw new Error('Invalid orgId');

    switch (req.method) {
      case 'GET':
        return await fetchProjects(req, res, orgId);

      case 'POST':
        return await createProject(req, res, orgId);

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
