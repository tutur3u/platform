import { createPagesServerClient } from '@supabase/auth-helpers-nextjs';
import type { NextApiRequest, NextApiResponse } from 'next';

const fetchMembers = async (
  req: NextApiRequest,
  res: NextApiResponse,
  wsId: string
) => {
  const supabase = createPagesServerClient({ req, res });

  const { page, itemsPerPage, roles } = req.query;

  const queryBuilder = supabase
    .from('workspace_members')
    .select(
      'role, role_title, created_at, users(id, handle, display_name, avatar_url)',
      {
        count: 'exact',
      }
    )
    .eq('ws_id', wsId);

  if (roles && typeof roles === 'string') {
    queryBuilder.in('role', roles.split(','));
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

  const { count, data, error } = await queryBuilder.order('created_at');

  if (error) return res.status(500).json({ error: error.message });

  return res.status(200).json({
    data: data.map((member) => ({
      ...member.users,
      role: member.role,
      role_title: member.role_title,
      created_at: member.created_at,
    })),
    count,
  });
};

const inviteMember = async (
  req: NextApiRequest,
  res: NextApiResponse,
  wsId: string
) => {
  const supabase = createPagesServerClient({ req, res });

  const { id, email } = req.body;

  if (!id && !email)
    return res.status(400).json({
      error: {
        message: 'Invalid request',
      },
    });

  if (id) {
    const { error } = await supabase
      .from('workspace_invites')
      .insert({ ws_id: wsId, user_id: id });

    if (error)
      return res.status(500).json({
        error: {
          message: 'User is already a member or invite has been sent',
        },
      });

    return res.status(200).json({ message: 'Invitation sent' });
  }

  if (email) {
    const { data, error } = await supabase
      .from('users')
      .select('id')
      .eq('email', email)
      .single();

    if (error)
      return res
        .status(500)
        .json({ error: { message: 'Could not find user' } });

    const { id: userId } = data;

    const { error: inviteError } = await supabase
      .from('workspace_invites')
      .insert({ ws_id: wsId, user_id: userId });

    if (inviteError)
      return res.status(500).json({
        error: {
          message: 'User is already a member or invite has been sent',
        },
      });

    return res.status(200).json({ message: 'Invitation sent' });
  }
};

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  try {
    const { wsId } = req.query;

    if (!wsId || typeof wsId !== 'string') throw new Error('Invalid wsId');

    switch (req.method) {
      case 'GET':
        return await fetchMembers(req, res, wsId);

      case 'POST':
        return await inviteMember(req, res, wsId);

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
