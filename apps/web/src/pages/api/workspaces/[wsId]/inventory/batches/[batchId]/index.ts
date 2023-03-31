import { createServerSupabaseClient } from '@supabase/auth-helpers-nextjs';
import type { NextApiRequest, NextApiResponse } from 'next';
import { ProductBatch } from '../../../../../../../types/primitives/ProductBatch';

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  try {
    const { batchId } = req.query;

    if (!batchId || typeof batchId !== 'string')
      throw new Error('Invalid batchId');

    switch (req.method) {
      case 'GET':
        return await fetchBatch(req, res, batchId);

      case 'PUT': {
        return await updateBatch(req, res, batchId);
      }

      case 'DELETE': {
        return await deleteBatch(req, res, batchId);
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

const fetchBatch = async (
  req: NextApiRequest,
  res: NextApiResponse,
  batchId: string
) => {
  const supabase = createServerSupabaseClient({ req, res });

  const { data, error } = await supabase
    .from('inventory_batches')
    .select('id, price, warehouse_id, supplier_id, created_at')
    .eq('id', batchId)
    .single();

  if (error) return res.status(500).json({ error: error.message });
  if (!data) return res.status(404).json({ error: 'Not found' });

  return res.status(200).json(data);
};

const updateBatch = async (
  req: NextApiRequest,
  res: NextApiResponse,
  batchId: string
) => {
  const supabase = createServerSupabaseClient({
    req,
    res,
  });

  const { price, warehouse_id, supplier_id } = req.body as ProductBatch;

  const { error } = await supabase
    .from('inventory_batches')
    .update({
      price,
      warehouse_id,
      supplier_id,
    })
    .eq('id', batchId);

  if (error) return res.status(401).json({ error: error.message });
  return res.status(200).json({});
};

const deleteBatch = async (
  req: NextApiRequest,
  res: NextApiResponse,
  batchId: string
) => {
  const supabase = createServerSupabaseClient({
    req,
    res,
  });

  const { error } = await supabase
    .from('inventory_batches')
    .delete()
    .eq('id', batchId);

  if (error) return res.status(401).json({ error: error.message });
  return res.status(200).json({});
};

export default handler;
