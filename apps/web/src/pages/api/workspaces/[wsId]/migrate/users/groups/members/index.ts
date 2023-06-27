import { createPagesServerClient } from '@supabase/auth-helpers-nextjs';
import type { NextApiRequest, NextApiResponse } from 'next';
import { UserGroupMember } from '../../../../../../../../types/primitives/UserGroupMember';

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  try {
    const { wsId } = req.query;

    if (!wsId || typeof wsId !== 'string') throw new Error('Invalid wsId');

    switch (req.method) {
      case 'POST':
        if (!wsId || typeof wsId !== 'string') throw new Error('Invalid wsId');
        return await migrateGroupMembers(req, res);

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

const migrateGroupMembers = async (
  req: NextApiRequest,
  res: NextApiResponse
) => {
  const supabase = createPagesServerClient({
    req,
    res,
  });

  const { members } = req.body as { members: UserGroupMember[] };

  // Upsert members
  const { error: upsertError } = await supabase
    .from('workspace_user_groups_users')
    .upsert(
      members.map((m) => ({
        user_id: m.user_id,
        group_id: m.group_id,
      }))
    );

  if (upsertError) {
    console.error(upsertError);

    return res.status(500).json({
      error: {
        message: 'Something went wrong',
      },
    });
  }

  return res.status(200).json({});
};

export default handler;
