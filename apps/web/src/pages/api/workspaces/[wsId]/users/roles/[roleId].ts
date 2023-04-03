import { createServerSupabaseClient } from '@supabase/auth-helpers-nextjs';
import type { NextApiRequest, NextApiResponse } from 'next';
import { UserRole } from '../../../../../../types/primitives/UserRole';

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  try {
    const { roleId } = req.query;

    if (!roleId || typeof roleId !== 'string')
      throw new Error('Invalid roleId');

    switch (req.method) {
      case 'GET':
        return await fetchUserRole(req, res, roleId);

      case 'PUT': {
        return await updateUserRole(req, res, roleId);
      }

      case 'DELETE': {
        return await deleteUserRole(req, res, roleId);
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

const fetchUserRole = async (
  req: NextApiRequest,
  res: NextApiResponse,
  roleId: string
) => {
  const supabase = createServerSupabaseClient({ req, res });

  const { data, error } = await supabase
    .from('workspace_user_roles')
    .select('id, name, created_at')
    .eq('id', roleId)
    .single();

  if (error) return res.status(500).json({ error: error.message });
  if (!data) return res.status(404).json({ error: 'Not found' });

  return res.status(200).json(data);
};

const updateUserRole = async (
  req: NextApiRequest,
  res: NextApiResponse,
  roleId: string
) => {
  const supabase = createServerSupabaseClient({
    req,
    res,
  });

  const { name } = req.body as UserRole;

  const { error } = await supabase
    .from('workspace_user_roles')
    .update({
      name,
    })
    .eq('id', roleId);

  if (error) return res.status(401).json({ error: error.message });
  return res.status(200).json({});
};

const deleteUserRole = async (
  req: NextApiRequest,
  res: NextApiResponse,
  roleId: string
) => {
  const supabase = createServerSupabaseClient({
    req,
    res,
  });

  const { error } = await supabase
    .from('workspace_user_roles')
    .delete()
    .eq('id', roleId);

  if (error) return res.status(401).json({ error: error.message });
  return res.status(200).json({});
};

export default handler;
