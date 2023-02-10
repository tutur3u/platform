import { createServerSupabaseClient } from '@supabase/auth-helpers-nextjs';
import type { NextApiRequest, NextApiResponse } from 'next';

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  try {
    const { walletId } = req.query;
    if (!walletId || typeof walletId !== 'string')
      throw new Error('Invalid ID');

    switch (req.method) {
      case 'PUT':
        return await updateWallet(req, res, walletId);

      case 'DELETE':
        return await deleteWallet(req, res, walletId);

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

const updateWallet = async (
  req: NextApiRequest,
  res: NextApiResponse,
  walletId: string
) => {
  const supabase = createServerSupabaseClient({
    req,
    res,
  });

  const { name, description, balance, currency } = req.body;

  const { error } = await supabase
    .from('project_wallets')
    .update({
      name,
      description,
      balance,
      currency,
    })
    .eq('id', walletId);

  if (error) return res.status(401).json({ error: error.message });
  return res.status(200).json({});
};

const deleteWallet = async (
  req: NextApiRequest,
  res: NextApiResponse,
  walletId: string
) => {
  const supabase = createServerSupabaseClient({
    req,
    res,
  });

  const { error } = await supabase.from('project_wallets').delete().eq('id', walletId);

  if (error) return res.status(401).json({ error: error.message });
  return res.status(200).json({});
};
