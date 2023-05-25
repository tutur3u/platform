import { createPagesServerClient } from '@supabase/auth-helpers-nextjs';
import type { NextApiRequest, NextApiResponse } from 'next';

const deleteMember = async (
  req: NextApiRequest,
  res: NextApiResponse,
  wsId: string,
  userId: string,
  invited = false
) => {
  const supabase = createPagesServerClient({ req, res });

  const { error } = await supabase
    .from(invited ? 'workspace_invites' : 'workspace_members')
    .delete()
    .eq('ws_id', wsId)
    .eq('user_id', userId);

  if (error) return res.status(500).json({ error: error.message });
  return res.status(200).json({ message: 'Member deleted' });
};

const updateMember = async (
  req: NextApiRequest,
  res: NextApiResponse,
  wsId: string,
  userId: string,
  invited = false
) => {
  const supabase = createPagesServerClient({ req, res });

  const { role, role_title } = req.body;

  const { error } = await supabase
    .from(invited ? 'workspace_invites' : 'workspace_members')
    .update({ role: role, role_title: role_title })
    .eq('ws_id', wsId)
    .eq('user_id', userId);

  if (error) return res.status(500).json({ error: error.message });
  return res.status(200).json({ message: 'Member updated' });
};

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  try {
    const { wsId, memberId, invited } = req.query;

    if (!wsId || !memberId) throw new Error('Invalid request');

    switch (req.method) {
      case 'PUT':
        return await updateMember(
          req,
          res,
          wsId as string,
          memberId as string,
          !!invited
        );

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
