import { Product } from './../../../../../../../../types/primitives/Product';
import { createServerSupabaseClient } from '@supabase/auth-helpers-nextjs';
import type { NextApiRequest, NextApiResponse } from 'next';

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  try {
    const { batchId } = req.query;

    if (!batchId || typeof batchId !== 'string')
      throw new Error('Invalid batchId');

    switch (req.method) {
      case 'GET':
        return await fetchProducts(req, res, batchId);

      case 'POST': {
        return await addProducts(req, res, batchId);
      }

      case 'DELETE': {
        return await deleteProducts(req, res, batchId);
      }

      default:
        throw new Error(
          `The HTTP ${req.method} method is not supported at this route.`
        );
    }
  } catch (error) {
    return res.status(500).json({
      error: {
        message: 'Something went wrong',
      },
    });
  }
};

const fetchProducts = async (
  req: NextApiRequest,
  res: NextApiResponse,
  batchId: string
) => {
  const supabase = createServerSupabaseClient({ req, res });

  const { data, error } = await supabase
    .from('inventory_batch_products')
    .select('amount, price, id:product_id, unit_id')
    .eq('batch_id', batchId);

  if (error) return res.status(500).json({ error: error.message });
  if (!data) return res.status(404).json({ error: 'Not found' });

  return res.status(200).json(data);
};

const addProducts = async (
  req: NextApiRequest,
  res: NextApiResponse,
  batchId: string
) => {
  const supabase = createServerSupabaseClient({
    req,
    res,
  });

  const { products } = req.body as { products: Product[] };

  const { error } = await supabase.from('inventory_batch_products').insert(
    products.map((p: Product) => ({
      price: p.price,
      amount: p.amount,
      product_id: p.id,
      unit_id: p.unit_id,
      batch_id: batchId,
    }))
  );

  if (error) return res.status(401).json({ error: error.message });
  return res.status(200).json({});
};

const deleteProducts = async (
  req: NextApiRequest,
  res: NextApiResponse,
  batchId: string
) => {
  const supabase = createServerSupabaseClient({
    req,
    res,
  });

  const { error } = await supabase
    .from('inventory_batch_products')
    .delete()
    .eq('batch_id', batchId);

  if (error) return res.status(401).json({ error: error.message });
  return res.status(200).json({});
};

export default handler;
