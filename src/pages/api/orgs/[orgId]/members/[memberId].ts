import { createServerSupabaseClient } from '@supabase/auth-helpers-nextjs';
import type { NextApiRequest, NextApiResponse } from 'next';

const deleteMember = async (
  req: NextApiRequest,
  res: NextApiResponse,
  user_id: string,
  invited = false
) => {
  const supabase = createServerSupabaseClient({ req, res });

  const { error } = await supabase
    .from(invited ? 'org_invites' : 'org_members')
    .delete()
    .eq('user_id', user_id);

  if (error) return res.status(500).json({ error: error.message });
  return res.status(200).json({ message: 'Member deleted' });
};

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  try {
    const { memberId, invited } = req.query;

    if (!memberId || typeof memberId !== 'string')
      throw new Error('Invalid memberId');

    switch (req.method) {
      case 'DELETE':
        return await deleteMember(req, res, memberId, !!invited);

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
