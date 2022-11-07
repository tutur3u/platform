import { createServerSupabaseClient } from '@supabase/auth-helpers-nextjs';
import type { NextApiRequest, NextApiResponse } from 'next';

const fetchUser = async (req: NextApiRequest, res: NextApiResponse) => {
  const supabase = createServerSupabaseClient({
    req,
    res,
  });

  const {
    query: { query: searchQuery },
  } = req;

  if (!searchQuery)
    return res.status(400).json({ error: 'Missing search query' });

  const { data, error } = await supabase.rpc('search_users_by_name', {
    search_query: searchQuery,
  });

  const normalizedData = data?.map((user) => ({
    id: user.id,
    email: user.email,
    username: user.username,
    displayName: user.display_name,
    avatarUrl: user.avatar_url,
  }));

  if (error) return res.status(401).json({ error: error.message });
  return res.status(200).json(normalizedData);
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
