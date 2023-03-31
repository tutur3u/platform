import { createServerSupabaseClient } from '@supabase/auth-helpers-nextjs';
import type { NextApiRequest, NextApiResponse } from 'next';

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  try {
    const { batchId, productId, unitId } = req.query;

    if (!batchId || typeof batchId !== 'string')
      throw new Error('Invalid batchId');

    if (!productId || typeof productId !== 'string')
      throw new Error('Invalid productId');

    if (!unitId || typeof unitId !== 'string')
      throw new Error('Invalid unitId');

    switch (req.method) {
      case 'GET':
        return await fetchProduct(req, res, batchId, productId, unitId);

      case 'PUT':
        return await updateProduct(req, res, batchId, productId, unitId);

      case 'DELETE':
        return await deleteProduct(req, res, batchId, productId, unitId);

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

const fetchProduct = async (
  req: NextApiRequest,
  res: NextApiResponse,
  batchId: string,
  productId: string,
  unitId: string
) => {
  const supabase = createServerSupabaseClient({ req, res });

  const { data, error } = await supabase
    .from('inventory_batch_products')
    .select('amount, price')
    .eq('batch_id', batchId)
    .eq('product_id', productId)
    .eq('unit_id', unitId)
    .single();

  if (error) return res.status(500).json({ error: error.message });
  if (!data) return res.status(404).json({ error: 'Not found' });

  return res.status(200).json(data);
};

const updateProduct = async (
  req: NextApiRequest,
  res: NextApiResponse,
  batchId: string,
  productId: string,
  unitId: string
) => {
  const supabase = createServerSupabaseClient({
    req,
    res,
  });

  const { amount, price } = req.body;

  const { error } = await supabase
    .from('inventory_batch_products')
    .update({
      product_id: productId,
      unit_id: unitId,
      amount,
      price,
    })
    .eq('batch_id', batchId)
    .eq('product_id', productId)
    .eq('unit_id', unitId);

  if (error) return res.status(401).json({ error: error.message });
  return res.status(200).json({});
};

const deleteProduct = async (
  req: NextApiRequest,
  res: NextApiResponse,
  batchId: string,
  productId: string,
  unitId: string
) => {
  const supabase = createServerSupabaseClient({
    req,
    res,
  });

  const { error } = await supabase
    .from('inventory_batch_products')
    .delete()
    .eq('batch_id', batchId)
    .eq('product_id', productId)
    .eq('unit_id', unitId);

  if (error) return res.status(401).json({ error: error.message });
  return res.status(200).json({});
};

export default handler;
