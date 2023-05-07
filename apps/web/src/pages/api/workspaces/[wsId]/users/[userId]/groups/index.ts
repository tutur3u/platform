import { createServerSupabaseClient } from '@supabase/auth-helpers-nextjs';
import type { NextApiRequest, NextApiResponse } from 'next';
import { UserGroup } from '../../../../../../../types/primitives/UserGroup';

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  try {
    const { userId } = req.query;

    if (!userId || typeof userId !== 'string')
      throw new Error('Invalid userId');

    switch (req.method) {
      case 'GET':
        return await fetchRoles(req, res, userId);

      case 'POST': {
        return await addRoles(req, res, userId);
      }

      case 'DELETE': {
        return await deleteRoles(req, res, userId);
      }

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

const fetchRoles = async (
  req: NextApiRequest,
  res: NextApiResponse,
  userId: string
) => {
  const supabase = createServerSupabaseClient({ req, res });

  const { data, error } = await supabase
    .from('workspace_user_groups_users')
    .select('id:group_id, workspace_user_groups(name), created_at')
    .eq('user_id', userId);

  if (error) return res.status(500).json({ error: error.message });
  if (!data) return res.status(404).json({ error: 'Not found' });

  return res.status(200).json(
    data.map((p) => ({
      id: p.id,
      name: Array.isArray(p.workspace_user_groups)
        ? p?.workspace_user_groups?.[0]?.name
        : p?.workspace_user_groups?.name,
      created_at: p.created_at,
    }))
  );
};

const addRoles = async (
  req: NextApiRequest,
  res: NextApiResponse,
  userId: string
) => {
  const supabase = createServerSupabaseClient({
    req,
    res,
  });

  const { groups } = req.body as { groups: UserGroup[] };

  const { error } = await supabase.from('workspace_user_groups_users').insert(
    groups.map((p) => ({
      group_id: p.id,
      user_id: userId,
    }))
  );

  if (error) return res.status(401).json({ error: error.message });
  return res.status(200).json({});
};

const deleteRoles = async (
  req: NextApiRequest,
  res: NextApiResponse,
  userId: string
) => {
  const supabase = createServerSupabaseClient({
    req,
    res,
  });

  const { error } = await supabase
    .from('workspace_user_groups_users')
    .delete()
    .eq('user_id', userId);

  if (error) return res.status(401).json({ error: error.message });
  return res.status(200).json({});
};

export default handler;
