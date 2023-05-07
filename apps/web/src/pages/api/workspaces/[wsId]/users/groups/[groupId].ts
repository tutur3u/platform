import { createServerSupabaseClient } from '@supabase/auth-helpers-nextjs';
import type { NextApiRequest, NextApiResponse } from 'next';
import { UserGroup } from '../../../../../../types/primitives/UserGroup';

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  try {
    const { groupId } = req.query;

    if (!groupId || typeof groupId !== 'string')
      throw new Error('Invalid groupId');

    switch (req.method) {
      case 'GET':
        return await fetchUserGroup(req, res, groupId);

      case 'PUT': {
        return await updateUserGroup(req, res, groupId);
      }

      case 'DELETE': {
        return await deleteUserGroup(req, res, groupId);
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

const fetchUserGroup = async (
  req: NextApiRequest,
  res: NextApiResponse,
  groupId: string
) => {
  const supabase = createServerSupabaseClient({ req, res });

  const { data, error } = await supabase
    .from('workspace_user_groups')
    .select('id, name, created_at')
    .eq('id', groupId)
    .single();

  if (error) return res.status(500).json({ error: error.message });
  if (!data) return res.status(404).json({ error: 'Not found' });

  return res.status(200).json(data);
};

const updateUserGroup = async (
  req: NextApiRequest,
  res: NextApiResponse,
  groupId: string
) => {
  const supabase = createServerSupabaseClient({
    req,
    res,
  });

  const { name } = req.body as UserGroup;

  const { error } = await supabase
    .from('workspace_user_groups')
    .update({
      name,
    })
    .eq('id', groupId);

  if (error) return res.status(401).json({ error: error.message });
  return res.status(200).json({});
};

const deleteUserGroup = async (
  req: NextApiRequest,
  res: NextApiResponse,
  groupId: string
) => {
  const supabase = createServerSupabaseClient({
    req,
    res,
  });

  const { error } = await supabase
    .from('workspace_user_groups')
    .delete()
    .eq('id', groupId);

  if (error) return res.status(401).json({ error: error.message });
  return res.status(200).json({});
};

export default handler;
