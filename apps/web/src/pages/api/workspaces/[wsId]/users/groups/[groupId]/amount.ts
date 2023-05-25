import { createPagesServerClient } from '@supabase/auth-helpers-nextjs';
import type { NextApiRequest, NextApiResponse } from 'next';

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  try {
    const { wsId, groupId } = req.query;

    if (!wsId || typeof wsId !== 'string') throw new Error('Invalid wsId');

    if (!groupId || typeof groupId !== 'string')
      throw new Error('Invalid groupId');

    switch (req.method) {
      case 'GET':
        return await fetchAmount(req, res, groupId);

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

const fetchAmount = async (
  req: NextApiRequest,
  res: NextApiResponse,
  groupId: string
) => {
  const supabase = createPagesServerClient({
    req,
    res,
  });

  const { count, error } = await supabase
    .from('workspace_user_groups_users')
    .select('user_id', {
      head: true,
      count: 'exact',
    })
    .eq('group_id', groupId);

  if (error) return res.status(401).json({ error: error.message });
  return res.status(200).json({ count });
};
