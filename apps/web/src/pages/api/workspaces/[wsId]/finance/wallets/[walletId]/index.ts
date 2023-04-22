import { createServerSupabaseClient } from '@supabase/auth-helpers-nextjs';
import type { NextApiRequest, NextApiResponse } from 'next';
import { Wallet } from '../../../../../../../types/primitives/Wallet';

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  try {
    const { walletId } = req.query;
    if (!walletId || typeof walletId !== 'string')
      throw new Error('Invalid walletId');

    switch (req.method) {
      case 'GET':
        return await fetchWallet(req, res, walletId);

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

const fetchWallet = async (
  req: NextApiRequest,
  res: NextApiResponse,
  walletId: string
) => {
  const supabase = createServerSupabaseClient({ req, res });

  const { data, error } = await supabase
    .from('workspace_wallets')
    .select(
      'name, description, currency, balance, type, credit_wallets(statement_date, payment_date, limit)'
    )
    .eq('id', walletId)
    .single();

  if (error) return res.status(500).json({ error: error.message });
  if (!data) return res.status(404).json({ error: 'Not found' });

  const newData = {
    name: data.name,
    description: data.description,
    currency: data.currency,
    balance: data.balance,
    type: data.type,

    statement_date: Array.isArray(data.credit_wallets)
      ? null
      : data.credit_wallets?.statement_date,
    payment_date: Array.isArray(data.credit_wallets)
      ? null
      : data.credit_wallets?.payment_date,
    limit: Array.isArray(data.credit_wallets)
      ? null
      : data.credit_wallets?.limit,
  } as Wallet;

  return res.status(200).json(newData);
};

const updateWallet = async (
  req: NextApiRequest,
  res: NextApiResponse,
  walletId: string
) => {
  const supabase = createServerSupabaseClient({
    req,
    res,
  });

  const {
    name,
    description,
    currency,
    type,
    statement_date,
    payment_date,
    limit,
  } = req.body as Wallet;

  const standardPromise = supabase
    .from('workspace_wallets')
    .update({
      name,
      description,
      currency,
      type,
    })
    .eq('id', walletId);

  const creditCardPromise =
    statement_date && payment_date && limit
      ? supabase
          .from('credit_wallets')
          .upsert({
            wallet_id: walletId,
            statement_date,
            payment_date,
            limit,
          })
          .eq('wallet_id', walletId)
      : Promise.resolve({ error: null });

  const [{ error }, { error: creditError }] = await Promise.all([
    standardPromise,
    creditCardPromise,
  ]);

  if (error) return res.status(401).json({ error: error.message });

  if (creditError) return res.status(401).json({ error: creditError.message });

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

  const { error } = await supabase
    .from('workspace_wallets')
    .delete()
    .eq('id', walletId);

  if (error) return res.status(401).json({ error: error.message });
  return res.status(200).json({});
};
