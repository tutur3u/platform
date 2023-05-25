import { createPagesServerClient } from '@supabase/auth-helpers-nextjs';
import type { NextApiRequest, NextApiResponse } from 'next';

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  try {
    const { userId, groupId } = req.query;

    if (!userId || typeof userId !== 'string')
      throw new Error('Invalid userId');

    if (!groupId || typeof groupId !== 'string')
      throw new Error('Invalid groupId');

    switch (req.method) {
      case 'DELETE':
        return await deleteGroup(req, res, userId, groupId);

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

const deleteGroup = async (
  req: NextApiRequest,
  res: NextApiResponse,
  userId: string,
  groupId: string
) => {
  const supabase = createPagesServerClient({
    req,
    res,
  });

  const { error } = await supabase
    .from('workspace_user_groups_users')
    .delete()
    .eq('user_id', userId)
    .eq('group_id', groupId);

  if (error) return res.status(401).json({ error: error.message });
  return res.status(200).json({});
};

export default handler;
