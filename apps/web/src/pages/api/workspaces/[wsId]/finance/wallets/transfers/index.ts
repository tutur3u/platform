import { createPagesServerClient } from '@supabase/auth-helpers-nextjs';
import type { NextApiRequest, NextApiResponse } from 'next';
import { WalletTransfer } from '../../../../../../../types/primitives/WalletTransfer';

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  try {
    switch (req.method) {
      case 'POST':
        return await createTransfer(req, res);

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

const createTransfer = async (req: NextApiRequest, res: NextApiResponse) => {
  const supabase = createPagesServerClient({
    req,
    res,
  });

  const { from_transaction_id, to_transaction_id } = req.body as WalletTransfer;

  const { error } = await supabase.from('workspace_wallet_transfers').insert({
    from_transaction_id,
    to_transaction_id,
  });

  if (error) return res.status(401).json({ error: error.message });
  return res.status(200).json({});
};
