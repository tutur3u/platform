import { createServerSupabaseClient } from '@supabase/auth-helpers-nextjs';
import type { NextApiRequest, NextApiResponse } from 'next';

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  try {
    const { projectId } = req.query;

    if (!projectId || typeof projectId !== 'string')
      throw new Error('Invalid projectId');

    switch (req.method) {
      case 'GET':
        return await fetchWallets(req, res, projectId);

      case 'POST':
        return await createWallet(req, res, projectId);

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
  projectId: string
) => {
  const supabase = createServerSupabaseClient({
    req,
    res,
  });

  const { data, error } = await supabase
    .from('wallets')
    .select('id, name, balance, currency, created_at')
    .eq('project_id', projectId);

  if (error) return res.status(401).json({ error: error.message });
  return res.status(200).json(data);
};

const createWallet = async (
  req: NextApiRequest,
  res: NextApiResponse,
  projectId: string
) => {
  const supabase = createServerSupabaseClient({
    req,
    res,
  });

  const { name, description, balance, currency } = JSON.parse(req.body);

  const { error } = await supabase.from('wallets').insert({
    name,
    description,
    balance,
    currency,
    project_id: projectId,
  });

  if (error) return res.status(401).json({ error: error.message });
  return res.status(200).json({ message: 'Wallet created' });
};
