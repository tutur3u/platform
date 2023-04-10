import { createServerSupabaseClient } from '@supabase/auth-helpers-nextjs';
import type { NextApiRequest, NextApiResponse } from 'next';
import { ProductPrice } from '../../../../../../../../../../types/primitives/ProductPrice';

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  try {
    const { productId, unitId, warehouseId } = req.query;

    if (!productId || typeof productId !== 'string')
      throw new Error('Invalid productId');

    if (!unitId || typeof unitId !== 'string')
      throw new Error('Invalid unitId');

    if (!warehouseId || typeof warehouseId !== 'string')
      throw new Error('Invalid warehouseId');

    switch (req.method) {
      case 'GET':
        return await fetchPrice(req, res, productId, unitId, warehouseId);

      case 'PUT': {
        return await updatePrice(req, res, productId, unitId, warehouseId);
      }

      case 'DELETE': {
        return await deletePrice(req, res, productId, unitId, warehouseId);
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
  unitId: string,
  warehouseId: string
) => {
  const supabase = createServerSupabaseClient({ req, res });

  const { data, error } = await supabase
    .from('inventory_products')
    .select('amount, min_amount, price')
    .eq('warehouse_id', warehouseId)
    .eq('product_id', productId)
    .eq('unit_id', unitId)
    .single();

  if (error) return res.status(500).json({ error: error.message });
  if (!data) return res.status(404).json({ error: 'Not found' });

  return res.status(200).json(data as ProductPrice);
};

const updatePrice = async (
  req: NextApiRequest,
  res: NextApiResponse,
  productId: string,
  unitId: string,
  warehouseId: string
) => {
  const supabase = createServerSupabaseClient({
    req,
    res,
  });

  const { amount, price, min_amount } = req.body as ProductPrice;

  const { error } = await supabase
    .from('inventory_products')
    .update({
      amount,
      price,
      min_amount: min_amount || 0,
    })
    .eq('warehouse_id', warehouseId)
    .eq('product_id', productId)
    .eq('unit_id', unitId);

  if (error) return res.status(401).json({ error: error.message });
  return res.status(200).json({});
};

const deletePrice = async (
  req: NextApiRequest,
  res: NextApiResponse,
  productId: string,
  unitId: string,
  warehouseId: string
) => {
  const supabase = createServerSupabaseClient({
    req,
    res,
  });

  const { error } = await supabase
    .from('inventory_products')
    .delete()
    .eq('warehouse_id', warehouseId)
    .eq('product_id', productId)
    .eq('unit_id', unitId);

  if (error) return res.status(401).json({ error: error.message });
  return res.status(200).json({});
};

export default handler;
