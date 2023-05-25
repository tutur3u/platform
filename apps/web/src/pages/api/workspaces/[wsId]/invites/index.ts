import { createPagesServerClient } from '@supabase/auth-helpers-nextjs';
import type { NextApiRequest, NextApiResponse } from 'next';

const acceptInvite = async (
  req: NextApiRequest,
  res: NextApiResponse,
  wsId: string
) => {
  const supabase = createPagesServerClient({
    req,
    res,
  });

  const { error } = await supabase
    .from('workspace_members')
    .insert({ ws_id: wsId });

  if (error) return res.status(401).json({ error: error.message });
  return res.status(200).json({ message: 'success' });
};

const declineInvite = async (
  req: NextApiRequest,
  res: NextApiResponse,
  wsId: string
) => {
  const supabase = createPagesServerClient({
    req,
    res,
  });

  const { data, error } = await supabase
    .from('workspace_invites')
    .delete()
    .eq('ws_id', wsId);

  if (error) return res.status(401).json({ error: error.message });
  return res.status(200).json(data);
};

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  try {
    const { wsId } = req.query;

    if (!wsId || typeof wsId !== 'string') throw new Error('Invalid wsId');

    switch (req.method) {
      case 'POST':
        return await acceptInvite(req, res, wsId);

      case 'DELETE':
        return await declineInvite(req, res, wsId);

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
