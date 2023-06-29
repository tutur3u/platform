import { createPagesServerClient } from '@supabase/auth-helpers-nextjs';
import type { NextApiRequest, NextApiResponse } from 'next';
import { UserGroup } from '../../../../../../../types/primitives/UserGroup';

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  try {
    const { wsId } = req.query;

    if (!wsId || typeof wsId !== 'string') throw new Error('Invalid wsId');

    switch (req.method) {
      case 'POST':
        if (!wsId || typeof wsId !== 'string') throw new Error('Invalid wsId');
        return await migrateUserGroups(req, res, wsId);

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

const migrateUserGroups = async (
  req: NextApiRequest,
  res: NextApiResponse,
  wsId: string
) => {
  const supabase = createPagesServerClient({
    req,
    res,
  });

  const { groups } = req.body as { groups: UserGroup[] };

  // Delete existing groups
  const { error: deleteError } = await supabase
    .from('workspace_user_groups')
    .delete()
    .eq('ws_id', wsId);

  // Upsert groups
  const { error: upsertError } = await supabase
    .from('workspace_user_groups')
    .upsert(
      groups.map((group) => ({
        ...group,
        ws_id: wsId,
      }))
    );

  if (upsertError || deleteError) {
    console.error(upsertError, deleteError);

    return res.status(500).json({
      error: {
        message: 'Something went wrong',
      },
    });
  }

  return res.status(200).json({});
};

export default handler;
