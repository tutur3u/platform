import { createServerSupabaseClient } from '@supabase/auth-helpers-nextjs';
import type { NextApiRequest, NextApiResponse } from 'next';
import { WorkspaceUser } from '../../../../../types/primitives/WorkspaceUser';

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  try {
    const { wsId } = req.query;

    if (!wsId || typeof wsId !== 'string') throw new Error('Invalid wsId');

    switch (req.method) {
      case 'GET':
        return await fetchWorkspaceUsers(req, res, wsId);

      case 'POST':
        return await createWorkspaceUser(req, res, wsId);

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

const fetchWorkspaceUsers = async (
  req: NextApiRequest,
  res: NextApiResponse,
  wsId: string
) => {
  const supabase = createServerSupabaseClient({
    req,
    res,
  });

  const { query, page, itemsPerPage } = req.query;

  const queryBuilder = supabase
    .from('workspace_users')
    .select(
      'id, name, gender, birthday, ethnicity, national_id, guardian, note, phone, email, address'
    )
    .eq('ws_id', wsId)
    .order('created_at', { ascending: false });

  if (query) {
    queryBuilder.ilike('name', `%${query}%`);
  }

  if (
    page &&
    itemsPerPage &&
    typeof page === 'string' &&
    typeof itemsPerPage === 'string'
  ) {
    const parsedPage = parseInt(page);
    const parsedSize = parseInt(itemsPerPage);

    const start = (parsedPage - 1) * parsedSize;
    const end = parsedPage * parsedSize;

    queryBuilder.range(start, end).limit(parsedSize);
  }

  const { data, error } = await queryBuilder;

  if (error) return res.status(401).json({ error: error.message });
  return res.status(200).json(data);
};

const createWorkspaceUser = async (
  req: NextApiRequest,
  res: NextApiResponse,
  wsId: string
) => {
  const supabase = createServerSupabaseClient({
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

  const { data, error } = await supabase
    .from('workspace_users')
    .insert({
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
    })
    .select('id')
    .single();

  if (error) return res.status(401).json({ error: error.message });
  return res.status(200).json({ id: data.id });
};
