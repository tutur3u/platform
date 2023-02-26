import { createServerSupabaseClient } from '@supabase/auth-helpers-nextjs';
import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '../../../utils/supabase/client';

const setupLocalEnvironment = async (
  req: NextApiRequest,
  res: NextApiResponse
) => {
  const supabase = createServerSupabaseClient({
    req,
    res,
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return res.status(401).json({ error: 'Not authorized' });

  const supabaseService = supabaseAdmin();

  if (!supabaseService)
    return res.status(401).json({ error: 'Not authorized' });

  const { data: currentInvites, error: currentInvitesError } =
    await supabaseService
      .from('workspace_members')
      .select('ws_id')
      .eq('user_id', user.id);

  if (currentInvitesError || !currentInvites)
    return res.status(401).json({ error: currentInvitesError.message });

  const { data, error } = await supabaseService
    .from('workspace_invites')
    .insert(
      [
        {
          ws_id: '00000000-0000-0000-0000-000000000001',
          user_id: user.id,
        },
        {
          ws_id: '00000000-0000-0000-0000-000000000002',
          user_id: user.id,
        },
      ].filter(({ ws_id }) => currentInvites.every((i) => i.ws_id !== ws_id))
    );

  if (error) return res.status(401).json({ error: error.message });
  return res.status(200).json(data);
};

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  try {
    if (process.env.NODE_ENV !== 'development')
      throw new Error('This route is only available in development mode');

    switch (req.method) {
      case 'POST':
        return await setupLocalEnvironment(req, res);

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
