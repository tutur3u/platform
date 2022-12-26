import { createServerSupabaseClient } from '@supabase/auth-helpers-nextjs';
import type { NextApiRequest, NextApiResponse } from 'next';

const fetchUser = async (req: NextApiRequest, res: NextApiResponse) => {
  const supabase = createServerSupabaseClient({
    req,
    res,
  });

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError) return res.status(401).json({ error: userError.message });

  const { data, error } = await supabase
    .from('users')
    .select('id, display_name, username, birthday, created_at')
    .eq('id', user?.id)
    .single();

  if (error) return res.status(401).json({ error: error.message });
  return res.status(200).json(data);
};

const updateUser = async (req: NextApiRequest, res: NextApiResponse) => {
  const supabase = createServerSupabaseClient({
    req,
    res,
  });

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError) return res.status(401).json({ error: userError.message });
  if (!user?.id) return res.status(401).json({ error: 'User not found' });

  const { displayName, username, birthday } = req.body;

  const { data, error } = await supabase
    .from('users')
    .update({ display_name: displayName, username, birthday })
    .eq('id', user.id);

  console.log(data, error);
  if (error) return res.status(401).json({ error: error.message });
  return res.status(200).json(data);
};

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  try {
    switch (req.method) {
      case 'GET':
        return await fetchUser(req, res);

      case 'PUT':
        return await updateUser(req, res);

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
