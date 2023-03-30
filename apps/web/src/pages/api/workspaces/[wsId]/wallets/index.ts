import { createServerSupabaseClient } from '@supabase/auth-helpers-nextjs';
import type { NextApiRequest, NextApiResponse } from 'next';

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  try {
    const { wsId } = req.query;

    if (!wsId || typeof wsId !== 'string') throw new Error('Invalid wsId');

    switch (req.method) {
      case 'GET':
        return await fetchWallets(req, res, wsId);

      case 'POST':
        return await createWallet(req, res, wsId);

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

const fetchWallets = async (
  req: NextApiRequest,
  res: NextApiResponse,
  wsId: string
) => {
  const supabase = createServerSupabaseClient({
    req,
    res,
  });

  const { data, error } = await supabase
    .from('workspace_wallets')
    .select('id, name, balance, currency, created_at, description')
    .order('created_at')
    .eq('ws_id', wsId);

  if (error) return res.status(401).json({ error: error.message });
  return res.status(200).json(data);
};

const createWallet = async (
  req: NextApiRequest,
  res: NextApiResponse,
  wsId: string
) => {
  const supabase = createServerSupabaseClient({
    req,
    res,
  });

  const { name, description, balance, currency } = JSON.parse(req.body);

  const { error } = await supabase.from('workspace_wallets').insert({
    name,
    description,
    balance,
    currency,
    ws_id: wsId,
  });

  if (error) return res.status(401).json({ error: error.message });
  return res.status(200).json({ message: 'Wallet created' });
};
