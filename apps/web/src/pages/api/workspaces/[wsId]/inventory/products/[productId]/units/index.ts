import { createServerSupabaseClient } from '@supabase/auth-helpers-nextjs';
import type { NextApiRequest, NextApiResponse } from 'next';
import { ProductUnit } from '../../../../../../../../types/primitives/ProductUnit';

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  try {
    const { wsId, productId } = req.query;

    if (!wsId || typeof wsId !== 'string') throw new Error('Invalid wsId');

    if (!productId || typeof productId !== 'string')
      throw new Error('Invalid productId');

    switch (req.method) {
      case 'GET':
        return await fetchUnits(req, res, productId);

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

const fetchUnits = async (
  req: NextApiRequest,
  res: NextApiResponse,
  productId: string
) => {
  const supabase = createServerSupabaseClient({ req, res });

  const { data, error } = await supabase
    .from('inventory_units')
    .select('id, name, inventory_products!inner(product_id)')
    .eq('inventory_products.product_id', productId);

  if (error) return res.status(500).json({ error: error.message });
  if (!data) return res.status(404).json({ error: 'Not found' });

  return res.status(200).json(data as ProductUnit[]);
};

export default handler;
