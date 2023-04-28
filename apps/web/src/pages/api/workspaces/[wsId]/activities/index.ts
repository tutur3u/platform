import { createServerSupabaseClient } from '@supabase/auth-helpers-nextjs';
import type { NextApiRequest, NextApiResponse } from 'next';

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  try {
    const { wsId } = req.query;

    if (!wsId || typeof wsId !== 'string') throw new Error('Invalid wsId');

    switch (req.method) {
      case 'GET':
        return await fetchActivities(req, res, wsId);

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

const fetchActivities = async (
  req: NextApiRequest,
  res: NextApiResponse,
  wsId: string
) => {
  const supabase = createServerSupabaseClient(
    {
      req,
      res,
    },
    {
      options: {
        db: {
          schema: 'audit',
        },
      },
    }
  );

  const { ops, userIds, page, itemsPerPage } = req.query;

  const queryBuilder = supabase
    .from('record_version')
    .select(
      'id, record_id, old_record_id, op, table_name, record, old_record, ts, auth_uid',
      {
        count: 'exact',
      }
    )
    .eq('ws_id', wsId);

  if (ops && typeof ops === 'string') {
    const operations = ops.split(',');
    queryBuilder.in('op', operations);
  }

  if (userIds && typeof userIds === 'string') {
    const ids = userIds.split(',');
    queryBuilder.eq('auth_uid', ids);
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
