import { createPagesServerClient } from '@supabase/auth-helpers-nextjs';
import type { NextApiRequest, NextApiResponse } from 'next';

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  try {
    const { wsId, categoryId } = req.query;

    if (!wsId || typeof wsId !== 'string') throw new Error('Invalid wsId');

    if (!categoryId || typeof categoryId !== 'string')
      throw new Error('Invalid categoryId');

    switch (req.method) {
      case 'GET':
        return await fetchAmount(req, res, wsId, categoryId);

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

const fetchAmount = async (
  req: NextApiRequest,
  res: NextApiResponse,
  wsId: string,
  categoryId: string
) => {
  const supabase = createPagesServerClient({
    req,
    res,
  });

  const { count, error } = await supabase
    .from('wallet_transactions')
    .select('id, workspace_wallets!inner(ws_id)', {
      head: true,
      count: 'exact',
    })
    .eq('category_id', categoryId)
    .eq('workspace_wallets.ws_id', wsId);

  if (error) return res.status(401).json({ error: error.message });
  return res.status(200).json({ count });
};
