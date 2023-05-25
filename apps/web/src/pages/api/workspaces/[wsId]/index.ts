import { createPagesServerClient } from '@supabase/auth-helpers-nextjs';
import type { NextApiRequest, NextApiResponse } from 'next';
import { Workspace } from '../../../../types/primitives/Workspace';

const fetchWorkspace = async (
  req: NextApiRequest,
  res: NextApiResponse,
  wsId: string
) => {
  const supabase = createPagesServerClient({ req, res });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return res.status(401).json({ error: 'Not authenticated' });

  const { data, error } = await supabase
    .from('workspace_members')
    .select('id:ws_id, role, workspaces(name, preset, created_at)')
    .eq('user_id', user.id)
    .eq('ws_id', wsId)
    .single();

  if (error) return res.status(500).json({ error: error.message });
  if (!data) return res.status(404).json({ error: 'Not found' });

  return res.status(200).json({
    id: data.id,
    role: data.role,
    ...data.workspaces,
  });
};

const updateWorkspace = async (
  req: NextApiRequest,
  res: NextApiResponse,
  wsId: string
) => {
  const supabase = createPagesServerClient({
    req,
    res,
  });

  const { name, preset } = JSON.parse(req.body) as Workspace;

  const { error } = await supabase
    .from('workspaces')
    .update({
      name,
      preset,
    })
    .eq('id', wsId);

  if (error) return res.status(401).json({ error: error.message });
  return res.status(200).json({});
};

const deleteWorkspace = async (
  req: NextApiRequest,
  res: NextApiResponse,
  wsId: string
) => {
  const supabase = createPagesServerClient({
    req,
    res,
  });

  const { error } = await supabase.from('workspaces').delete().eq('id', wsId);

  if (error) return res.status(401).json({ error: error.message });
  return res.status(200).json({});
};

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  try {
    const { wsId } = req.query;

    if (!wsId || typeof wsId !== 'string') throw new Error('Invalid wsId');

    switch (req.method) {
      case 'GET':
        return await fetchWorkspace(req, res, wsId);

      case 'PUT':
        return await updateWorkspace(req, res, wsId);

      case 'DELETE':
        return await deleteWorkspace(req, res, wsId);

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
