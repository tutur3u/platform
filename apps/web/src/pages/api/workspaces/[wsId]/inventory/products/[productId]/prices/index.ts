import { ProductPrice } from './../../../../../../../../types/primitives/ProductPrice';
import { createServerSupabaseClient } from '@supabase/auth-helpers-nextjs';
import type { NextApiRequest, NextApiResponse } from 'next';

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  try {
    const { productId } = req.query;

    if (!productId || typeof productId !== 'string')
      throw new Error('Invalid productId');

    switch (req.method) {
      case 'GET':
        return await fetchPrices(req, res, productId);

      case 'POST': {
        return await addPrices(req, res, productId);
      }

      case 'DELETE': {
        return await deletePrices(req, res, productId);
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
  productId: string
) => {
  const supabase = createServerSupabaseClient({ req, res });

  const { data, error } = await supabase
    .from('inventory_products')
    .select('amount, price')
    .eq('product_id', productId)
    .single();

  if (error) return res.status(500).json({ error: error.message });
  if (!data) return res.status(404).json({ error: 'Not found' });

  return res.status(200).json(data);
};

const addPrices = async (
  req: NextApiRequest,
  res: NextApiResponse,
  productId: string
) => {
  const supabase = createServerSupabaseClient({
    req,
    res,
  });

  const prices = JSON.parse(req.body) as ProductPrice[];

  const { error } = await supabase.from('inventory_products').insert(
    prices.map((p: ProductPrice) => ({
      price: p.price,
      product_id: productId,
      unit_id: p.unit_id,
    }))
  );

  if (error) return res.status(401).json({ error: error.message });
  return res.status(200).json({});
};

const deletePrices = async (
  req: NextApiRequest,
  res: NextApiResponse,
  productId: string
) => {
  const supabase = createServerSupabaseClient({
    req,
    res,
  });

  const { error } = await supabase
    .from('inventory_products')
    .delete()
    .eq('product_id', productId);

  if (error) return res.status(401).json({ error: error.message });
  return res.status(200).json({});
};

export default handler;
