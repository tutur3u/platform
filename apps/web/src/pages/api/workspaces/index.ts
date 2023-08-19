import type { NextApiRequest, NextApiResponse } from 'next';
import { createAdminClient } from '../../../utils/supabase/client';
import { verifyRootAccess } from '../../../utils/serverless/verify-root-access';

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  try {
    await verifyRootAccess(req, res);

    switch (req.method) {
      case 'GET':
        return await fetchUsers(req, res);

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

const fetchUsers = async (req: NextApiRequest, res: NextApiResponse) => {
  const supabase = createAdminClient();
  if (!supabase) return res.status(401).json({ error: 'Unauthorized' });

  const { query, page, itemsPerPage } = req.query;

  const queryBuilder = supabase
    .from('workspaces')
    .select('*')
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
