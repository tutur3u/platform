import { createServerSupabaseClient } from '@supabase/auth-helpers-nextjs';
import type { NextApiRequest, NextApiResponse } from 'next';

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  try {
    const { userId, roleId } = req.query;

    if (!userId || typeof userId !== 'string')
      throw new Error('Invalid userId');

    if (!roleId || typeof roleId !== 'string')
      throw new Error('Invalid roleId');

    switch (req.method) {
      case 'DELETE':
        return await deleteRole(req, res, userId, roleId);

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

const deleteRole = async (
  req: NextApiRequest,
  res: NextApiResponse,
  userId: string,
  roleId: string
) => {
  const supabase = createServerSupabaseClient({
    req,
    res,
  });

  const { error } = await supabase
    .from('workspace_user_roles_users')
    .delete()
    .eq('user_id', userId)
    .eq('role_id', roleId);

  if (error) return res.status(401).json({ error: error.message });
  return res.status(200).json({});
};

export default handler;
