import { createPagesServerClient } from '@supabase/auth-helpers-nextjs';
import type { NextApiRequest, NextApiResponse } from 'next';

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  try {
    const supabase = createPagesServerClient({
      req,
      res,
    });

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user?.id) throw new Error('Unauthorized');

    switch (req.method) {
      case 'GET':
        return await fetchActivities(req, res);

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

const fetchActivities = async (req: NextApiRequest, res: NextApiResponse) => {
  const supabase = createPagesServerClient({
    req,
    res,
  });

  const { ops, wsIds, page, itemsPerPage } = req.query;

  const queryBuilder = supabase
    .from('audit_logs')
    .select(
      'id, record_id, old_record_id, op, table_name, record, old_record, ts, auth_uid, ws_id',
      {
        count: 'exact',
      }
    )
    .order('ts', { ascending: false });

  if (ops && typeof ops === 'string') {
    queryBuilder.in('op', ops.split(','));
  }

  if (wsIds && typeof wsIds === 'string') {
    queryBuilder.in('ws_id', wsIds.split(','));
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
  return res.status(200).json({ data, count });
};
