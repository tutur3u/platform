import { createServerSupabaseClient } from '@supabase/auth-helpers-nextjs';
import type { NextApiRequest, NextApiResponse } from 'next';

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  try {
    switch (req.method) {
      case 'GET':
        return await fetchInvites(req, res);

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

const fetchInvites = async (req: NextApiRequest, res: NextApiResponse) => {
  const supabase = createServerSupabaseClient({
    req,
    res,
  });

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError) return res.status(401).json({ error: userError.message });

  const { data, error } = await supabase
    .from('workspace_invites')
    .select('created_at, workspaces(id, name)')
    .eq('user_id', user?.id);

  if (error) return res.status(401).json({ error: error.message });

  return res
    .status(200)
    .json(data.map((ws) => ({ ...ws.workspaces, created_at: ws.created_at })));
};
