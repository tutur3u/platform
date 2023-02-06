import { createServerSupabaseClient } from '@supabase/auth-helpers-nextjs';
import type { NextApiRequest, NextApiResponse } from 'next';

const deleteMember = async (
  req: NextApiRequest,
  res: NextApiResponse,
  orgId: string,
  userId: string,
  invited = false
) => {
  const supabase = createServerSupabaseClient({ req, res });

  const { error } = await supabase
    .from(invited ? 'org_invites' : 'org_members')
    .delete()
    .eq('org_id', orgId)
    .eq('user_id', userId);

  if (error) return res.status(500).json({ error: error.message });
  return res.status(200).json({ message: 'Member deleted' });
};

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  try {
    const { orgId, memberId, invited } = req.query;

    if (!orgId || !memberId) throw new Error('Invalid request');

    switch (req.method) {
      case 'DELETE':
        return await deleteMember(
          req,
          res,
          orgId as string,
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
