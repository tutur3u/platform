import type { NextApiRequest, NextApiResponse } from 'next';
import { verifyRootAccess } from '../../../utils/serverless/verify-root-access';
import { supabaseAdmin } from '../../../utils/supabase/client';

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  try {
    await verifyRootAccess(req, res);

    switch (req.method) {
      case 'GET':
        return await fetchCount(req, res);

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

const fetchCount = async (req: NextApiRequest, res: NextApiResponse) => {
  const supabase = supabaseAdmin();
  if (!supabase) return res.status(401).json({ error: 'Unauthorized' });

  const { count, error } = await supabase
    .from('workspaces')
    .select('id', { count: 'exact', head: true });

  if (error) return res.status(401).json({ error: error.message });
  return res.status(200).json(count);
};
