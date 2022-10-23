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
    .select('id, display_name, username')
    .eq('id', user?.id)
    .single();

  if (error) return res.status(401).json({ error: error.message });
  return res.status(200).json(data);
};

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  try {
    switch (req.method) {
      case 'GET':
        return await fetchUser(req, res);

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
