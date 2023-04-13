import { createServerSupabaseClient } from '@supabase/auth-helpers-nextjs';
import type { NextApiRequest, NextApiResponse } from 'next';
import { Workspace } from '../../../types/primitives/Workspace';

const fetchWorkspaces = async (req: NextApiRequest, res: NextApiResponse) => {
  const supabase = createServerSupabaseClient({
    req,
    res,
  });

  const { data, error } = await supabase
    .from('workspaces')
    .select('id, name, workspace_members!inner(ws_id), preset')
    .order('created_at', { ascending: false });

  if (error) return res.status(401).json({ error: error.message });

  return res.status(200).json(data);
};

const createWorkspace = async (req: NextApiRequest, res: NextApiResponse) => {
  const supabase = createServerSupabaseClient({
    req,
    res,
  });

  const { name, preset } = JSON.parse(req.body) as Workspace;

  const { error } = await supabase
    .from('workspaces')
    .insert({
      name,
      preset,
    })
    .single();

  if (error) return res.status(401).json({ error: error.message });
  return res.status(200).json({ message: 'success' });
};

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  try {
    switch (req.method) {
      case 'GET':
        return await fetchWorkspaces(req, res);

      case 'POST':
        return await createWorkspace(req, res);

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
