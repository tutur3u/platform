import { createServerSupabaseClient } from '@supabase/auth-helpers-nextjs';
import type { NextApiRequest, NextApiResponse } from 'next';

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  try {
    const { transactionId } = req.query;
    if (!transactionId || typeof transactionId !== 'string')
      throw new Error('Invalid ID');

    switch (req.method) {
      case 'GET':
        return await getTransfer(req, res, transactionId);

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

const getTransfer = async (
  req: NextApiRequest,
  res: NextApiResponse,
  transactionId: string
) => {
  const supabase = createServerSupabaseClient({
    req,
    res,
  });

  const from = supabase
    .from('workspace_wallet_transfers')
    .select(
      'to_transaction_id, destination_wallet:wallet_transactions!to_transaction_id(wallet_id)'
    )
    .eq('from_transaction_id', transactionId)
    .maybeSingle();

  const to = supabase
    .from('workspace_wallet_transfers')
    .select(
      'from_transaction_id, origin_wallet:wallet_transactions!from_transaction_id(wallet_id)'
    )
    .eq('to_transaction_id', transactionId)
    .maybeSingle();

  const [fromRes, toRes] = await Promise.all([from, to]);

  const { data: fromData, error: fromError } = fromRes;
  const { data: toData, error: toError } = toRes;

  if (fromError || toError)
    return res
      .status(401)
      .json({ error: fromError?.message || toError?.message });

  return res.status(200).json({
    from_transaction_id: toData?.from_transaction_id,
    to_transaction_id: fromData?.to_transaction_id,
    origin_wallet_id: Array.isArray(toData?.origin_wallet)
      ? toData?.origin_wallet[0]?.wallet_id
      : toData?.origin_wallet?.wallet_id,
    destination_wallet_id: Array.isArray(fromData?.destination_wallet)
      ? fromData?.destination_wallet[0]?.wallet_id
      : fromData?.destination_wallet?.wallet_id,
  });
};
