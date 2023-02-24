import { createServerSupabaseClient } from '@supabase/auth-helpers-nextjs';
import type { NextApiRequest, NextApiResponse } from 'next';

const deleteMember = async (
  req: NextApiRequest,
  res: NextApiResponse,
  wsId: string,
  userId: string,
  invited = false
) => {
  const supabase = createServerSupabaseClient({ req, res });

  const { error } = await supabase
    .from(invited ? 'workspace_invites' : 'workspace_members')
    .delete()
    .eq('ws_id', wsId)
    .eq('user_id', userId);

  if (error) return res.status(500).json({ error: error.message });
  return res.status(200).json({ message: 'Member deleted' });
};

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  try {
    const { wsId, memberId, invited } = req.query;

    if (!wsId || !memberId) throw new Error('Invalid request');

    switch (req.method) {
      case 'DELETE':
        return await deleteMember(
          req,
          res,
          wsId as string,
          memberId as string,
          !!invited
        );

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
