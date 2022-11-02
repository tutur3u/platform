import { createServerSupabaseClient } from '@supabase/auth-helpers-nextjs';
import type { NextApiRequest, NextApiResponse } from 'next';

const fetchMembers = async (
  req: NextApiRequest,
  res: NextApiResponse,
  orgId: string
) => {
  const supabase = createServerSupabaseClient({ req, res });

  const { data, error } = await supabase
    .from('org_members')
    .select('users(id, display_name, email)')
    .eq('org_id', orgId);

  if (error) return res.status(500).json({ error: error.message });
  if (!data) return res.status(404).json({ error: 'Not found' });

  return res.status(200).json(data);
};

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  try {
    const { orgId } = req.query;

    if (!orgId || typeof orgId !== 'string') throw new Error('Invalid orgId');

    switch (req.method) {
      case 'GET':
        return await fetchMembers(req, res, orgId);

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
