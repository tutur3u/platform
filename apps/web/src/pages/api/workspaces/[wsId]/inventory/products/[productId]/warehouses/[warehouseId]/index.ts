import { ProductPrice } from '../../../../../../../../../types/primitives/ProductPrice';
import { createServerSupabaseClient } from '@supabase/auth-helpers-nextjs';
import type { NextApiRequest, NextApiResponse } from 'next';

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  try {
    const { wsId, productId, warehouseId } = req.query;

    if (!wsId || typeof wsId !== 'string') throw new Error('Invalid wsId');

    if (!productId || typeof productId !== 'string')
      throw new Error('Invalid productId');

    if (!warehouseId || typeof warehouseId !== 'string')
      throw new Error('Invalid warehouseId');

    switch (req.method) {
      case 'GET':
        return await fetchPrices(req, res, productId, warehouseId);

      case 'POST': {
        return await addPrices(req, res, productId, warehouseId);
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

const fetchPrices = async (
  req: NextApiRequest,
  res: NextApiResponse,
  productId: string,
  warehouseId: string
) => {
  const supabase = createServerSupabaseClient({ req, res });

  const { data, error } = await supabase
    .from('inventory_products')
    .select('product_id, unit_id, warehouse_id, amount, min_amount, price')
    .eq('product_id', productId)
    .eq('warehouse_id', warehouseId);

  if (error) return res.status(500).json({ error: error.message });
  if (!data) return res.status(404).json({ error: 'Not found' });

  return res.status(200).json(data as ProductPrice[]);
};

const addPrices = async (
  req: NextApiRequest,
  res: NextApiResponse,
  productId: string,
  warehouseId: string
) => {
  const supabase = createServerSupabaseClient({
    req,
    res,
  });

  const { prices } = req.body as { prices: ProductPrice[] };

  const { error } = await supabase.from('inventory_products').insert(
    prices.map((p: ProductPrice) => ({
      min_amount: p?.min_amount || 0,
      warehouse_id: warehouseId,
      product_id: productId,
      unit_id: p.unit_id,
      price: p.price,
    }))
  );

  if (error) return res.status(401).json({ error: error.message });
  return res.status(200).json({});
};

export default handler;
