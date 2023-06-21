import { createPagesServerClient } from '@supabase/auth-helpers-nextjs';
import type { NextApiRequest, NextApiResponse } from 'next';
import { WorkspaceUser } from '../../../../../../types/primitives/WorkspaceUser';

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  try {
    const { wsId, userId } = req.query;

    if (!userId || typeof userId !== 'string')
      throw new Error('Invalid userId');

    switch (req.method) {
      case 'GET':
        return await fetchWorkspaceUser(req, res, userId);

      case 'POST':
        if (!wsId || typeof wsId !== 'string') throw new Error('Invalid wsId');
        return await createWorkspaceUser(req, res, wsId, userId);

      case 'PUT': {
        return await updateWorkspaceUser(req, res, userId);
      }

      case 'DELETE': {
        return await deleteWorkspaceUser(req, res, userId);
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

const fetchWorkspaceUser = async (
  req: NextApiRequest,
  res: NextApiResponse,
  userId: string
) => {
  const supabase = createPagesServerClient({ req, res });

  const { data, error } = await supabase
    .from('workspace_users')
    .select(
      'id, name, gender, birthday, ethnicity, national_id, guardian, note, phone, email, address'
    )
    .eq('id', userId)
    .maybeSingle();

  if (error) return res.status(500).json({ error: error.message });
  if (!data) return res.status(404).json({ error: 'User not found' });
  return res.status(200).json(data);
};

const createWorkspaceUser = async (
  req: NextApiRequest,
  res: NextApiResponse,
  wsId: string,
  userId: string
) => {
  const supabase = createPagesServerClient({
    req,
    res,
  });

  const {
    name,
    gender,
    birthday,
    ethnicity,
    national_id,
    guardian,
    note,
    phone,
    email,
    address,
    created_at,
  } = req.body as WorkspaceUser;

  const { error } = await supabase
    .from('workspace_users')
    .insert({
      id: userId,
      name,
      gender,
      birthday,
      ethnicity,
      national_id,
      guardian,
      note,
      phone,
      email,
      address,
      ws_id: wsId,
      created_at,
    })
    .eq('id', userId);

  if (error) return res.status(401).json({ error: error.message });
  return res.status(200).json({});
};

const updateWorkspaceUser = async (
  req: NextApiRequest,
  res: NextApiResponse,
  userId: string
) => {
  const supabase = createPagesServerClient({
    req,
    res,
  });

  const {
    name,
    gender,
    birthday,
    ethnicity,
    national_id,
    guardian,
    note,
    phone,
    email,
    address,
  } = req.body as WorkspaceUser;

  const { error } = await supabase
    .from('workspace_users')
    .update({
      name,
      gender,
      birthday,
      ethnicity,
      national_id,
      guardian,
      note,
      phone,
      email,
      address,
    })
    .eq('id', userId);

  if (error) return res.status(401).json({ error: error.message });
  return res.status(200).json({});
};

const deleteWorkspaceUser = async (
  req: NextApiRequest,
  res: NextApiResponse,
  userId: string
) => {
  const supabase = createPagesServerClient({
    req,
    res,
  });

  const { error } = await supabase
    .from('workspace_users')
    .delete()
    .eq('id', userId);

  if (error) return res.status(401).json({ error: error.message });
  return res.status(200).json({});
};

export default handler;
