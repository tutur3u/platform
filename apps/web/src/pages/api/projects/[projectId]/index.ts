import { createServerSupabaseClient } from '@supabase/auth-helpers-nextjs';
import type { NextApiRequest, NextApiResponse } from 'next';

const fetchProject = async (
  req: NextApiRequest,
  res: NextApiResponse,
  projectId: string
) => {
  const supabase = createServerSupabaseClient({ req, res });

  const { data, error } = await supabase
    .from('projects')
    .select('id, name, created_at, workspaces(id, name)')
    .eq('id', projectId)
    .single();

  if (error) return res.status(500).json({ error: error.message });

  return res.status(200).json(data);
};

const updateProject = async (
  req: NextApiRequest,
  res: NextApiResponse,
  projectId: string
) => {
  const supabase = createServerSupabaseClient({ req, res });

  const { name } = req.body;

  const { error } = await supabase
    .from('projects')
    .update({ name })
    .eq('id', projectId);

  if (error)
    return res.status(500).json({
      error: {
        message: 'Something went wrong',
      },
    });

  return res.status(200).json({});
};

const deleteProject = async (
  req: NextApiRequest,
  res: NextApiResponse,
  projectId: string
) => {
  const supabase = createServerSupabaseClient({ req, res });

  const { error } = await supabase
    .from('projects')
    .delete()
    .eq('id', projectId);

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
    const { projectId } = req.query;

    if (!projectId || typeof projectId !== 'string')
      throw new Error('Invalid request');

    switch (req.method) {
      case 'GET':
        return await fetchProject(req, res, projectId);

      case 'PUT':
        return await updateProject(req, res, projectId);

      case 'DELETE':
        return await deleteProject(req, res, projectId);

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
