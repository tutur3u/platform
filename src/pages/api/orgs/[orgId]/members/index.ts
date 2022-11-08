import { createServerSupabaseClient } from '@supabase/auth-helpers-nextjs';
import type { NextApiRequest, NextApiResponse } from 'next';

const fetchMembers = async (
  req: NextApiRequest,
  res: NextApiResponse,
  orgId: string
) => {
  const supabase = createServerSupabaseClient({ req, res });

  const membersQuery = supabase
    .from('org_members')
    .select('created_at, users(id, username, display_name, avatar_url, email)')
    .eq('org_id', orgId);

  const invitesQuery = supabase
    .from('org_invites')
    .select('created_at, users(id, username, display_name, avatar_url, email)')
    .eq('org_id', orgId);

  const [members, invites] = await Promise.all([membersQuery, invitesQuery]);

  if (members.error)
    return res.status(500).json({ error: members.error.message });
  if (invites.error)
    return res.status(500).json({ error: invites.error.message });

  const membersData = members.data.map((member) => ({
    ...member.users,
    created_at: member.created_at,
  }));
  const invitesData = invites.data.map((invite) => ({
    ...invite.users,
    created_at: invite.created_at,
  }));

  return res.status(200).json({ members: membersData, invites: invitesData });
};

const inviteMember = async (
  req: NextApiRequest,
  res: NextApiResponse,
  orgId: string
) => {
  const supabase = createServerSupabaseClient({ req, res });

  const { id, email } = req.body;

  console.log('id', id);
  console.log('email', email);

  if (!id && !email)
    return res.status(400).json({
      error: {
        message: 'Invalid request',
      },
    });

  if (id) {
    const { error } = await supabase
      .from('org_invites')
      .insert({ org_id: orgId, user_id: id });

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
      .from('org_invites')
      .insert({ org_id: orgId, user_id: userId });

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
    const { orgId } = req.query;

    if (!orgId || typeof orgId !== 'string') throw new Error('Invalid orgId');

    switch (req.method) {
      case 'GET':
        return await fetchMembers(req, res, orgId);

      case 'POST':
        return await inviteMember(req, res, orgId);

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
