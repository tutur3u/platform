import { createPagesServerClient } from '@supabase/auth-helpers-nextjs';
import type { NextApiRequest, NextApiResponse } from 'next';

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  try {
    const { groupId } = req.query;

    if (!groupId || typeof groupId !== 'string')
      throw new Error('Invalid groupId');

    switch (req.method) {
      case 'GET':
        return await fetchCount(req, res, groupId);

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

const fetchCount = async (
  req: NextApiRequest,
  res: NextApiResponse,
  groupId: string
) => {
  const supabase = createPagesServerClient({ req, res });

  const { data, error } = await supabase
    .from('vital_group_vitals')
    .select('vital_id')
    .eq('group_id', groupId);

  if (error) return res.status(500).json({ error: error.message });
  if (!data) return res.status(404).json({ error: 'Not found' });

  return res.status(200).json({ count: data?.length || 0 });
};

export default handler;
