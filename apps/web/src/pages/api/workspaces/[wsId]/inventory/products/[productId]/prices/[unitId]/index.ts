import { createServerSupabaseClient } from '@supabase/auth-helpers-nextjs';
import type { NextApiRequest, NextApiResponse } from 'next';

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  try {
    const { productId, unitId } = req.query;

    if (!productId || typeof productId !== 'string')
      throw new Error('Invalid productId');

    if (!unitId || typeof unitId !== 'string')
      throw new Error('Invalid unitId');

    switch (req.method) {
      case 'GET':
        return await fetchPrice(req, res, productId, unitId);

      case 'PUT': {
        return await updatePrice(req, res, productId, unitId);
      }

      case 'DELETE': {
        return await deletePrice(req, res, productId, unitId);
      }

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

const fetchPrice = async (
  req: NextApiRequest,
  res: NextApiResponse,
  productId: string,
  unitId: string
) => {
  const supabase = createServerSupabaseClient({ req, res });

  const { data, error } = await supabase
    .from('inventory_products')
    .select('amount, price')
    .eq('product_id', productId)
    .eq('unit_id', unitId)
    .single();

  if (error) return res.status(500).json({ error: error.message });
  if (!data) return res.status(404).json({ error: 'Not found' });

  return res.status(200).json(data);
};

const updatePrice = async (
  req: NextApiRequest,
  res: NextApiResponse,
  productId: string,
  unitId: string
) => {
  const supabase = createServerSupabaseClient({
    req,
    res,
  });

  const { amount, price } = req.body;

  const { error } = await supabase
    .from('inventory_products')
    .update({
      amount,
      price,
    })
    .eq('product_id', productId)
    .eq('unit_id', unitId);

  if (error) return res.status(401).json({ error: error.message });
  return res.status(200).json({});
};

const deletePrice = async (
  req: NextApiRequest,
  res: NextApiResponse,
  productId: string,
  unitId: string
) => {
  const supabase = createServerSupabaseClient({
    req,
    res,
  });

  const { error } = await supabase
    .from('inventory_products')
    .delete()
    .eq('product_id', productId)
    .eq('unit_id', unitId);

  if (error) return res.status(401).json({ error: error.message });
  return res.status(200).json({});
};

export default handler;
