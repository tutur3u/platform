import { createServerSupabaseClient } from '@supabase/auth-helpers-nextjs';
import type { NextApiRequest, NextApiResponse } from 'next';

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  try {
    const { wsId } = req.query;

    if (!wsId || typeof wsId !== 'string') throw new Error('Invalid wsId');

    switch (req.method) {
      case 'GET':
        return await fetchInvites(req, res, wsId);

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

const fetchInvites = async (
  req: NextApiRequest,
  res: NextApiResponse,
  wsId: string
) => {
  const supabase = createServerSupabaseClient({ req, res });

  const { page, itemsPerPage, roles } = req.query;

  const queryBuilder = supabase
    .from('workspace_invites')
    .select('created_at, users(id, handle, display_name, avatar_url)', {
      count: 'exact',
    })
    .eq('ws_id', wsId);

  if (roles && typeof roles === 'string') {
    queryBuilder.eq('role', roles);
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

  const { count, data, error } = await queryBuilder;

  if (error) return res.status(500).json({ error: error.message });

  return res.status(200).json({
    data: data.map((member) => ({
      ...member.users,
      created_at: member.created_at,
    })),
    count,
  });
};
