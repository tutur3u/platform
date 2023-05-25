import { createPagesServerClient } from '@supabase/auth-helpers-nextjs';
import type { NextApiRequest, NextApiResponse } from 'next';
import { Wallet } from '../../../../../../types/primitives/Wallet';

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  try {
    const { wsId } = req.query;

    if (!wsId || typeof wsId !== 'string') throw new Error('Invalid wsId');

    switch (req.method) {
      case 'POST':
        return await createWallets(req, res, wsId);

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

const createWallets = async (
  req: NextApiRequest,
  res: NextApiResponse,
  wsId: string
) => {
  const supabase = createPagesServerClient({
    req,
    res,
  });

  const { wallets } = req.body as { wallets: Wallet[] };

  const { data, error } = await supabase
    .from('workspace_wallets')
    .insert(
      wallets.map((w) => ({
        name: w.name,
        description: w.description,
        currency: w.currency,
        ws_id: wsId,
      }))
    )
    .select('id, name');

  if (error) return res.status(401).json({ error: error.message });
  return res.status(200).json(data);
};
