import { createPagesServerClient } from '@supabase/auth-helpers-nextjs';
import type { NextApiRequest, NextApiResponse } from 'next';
import { Workspace } from '../../../types/primitives/Workspace';

const updateWorkspaces = async (req: NextApiRequest, res: NextApiResponse) => {
  const supabase = createPagesServerClient({
    req,
    res,
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  const { workspaces } = req.body as { workspaces: Workspace[] };

  console.log(
    workspaces.map(({ id }, idx) => ({
      ws_id: id,
      sort_key: idx,
      user_id: user.id,
    }))
  );

  const { error } = await supabase
    .from('workspace_members')
    .upsert(
      workspaces.map(({ id }, idx) => ({
        ws_id: id,
        sort_key: idx,
        user_id: user.id,
      }))
    )
    .eq('user_id', user.id);

  if (error) return res.status(401).json({ error: error.message });
  return res.status(200).json({ message: 'success' });
};

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  try {
    switch (req.method) {
      case 'POST':
        return await updateWorkspaces(req, res);

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
