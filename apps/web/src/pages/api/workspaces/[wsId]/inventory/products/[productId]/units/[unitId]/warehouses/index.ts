import { createServerSupabaseClient } from '@supabase/auth-helpers-nextjs';
import type { NextApiRequest, NextApiResponse } from 'next';
import { ProductWarehouse } from '../../../../../../../../../../types/primitives/ProductWarehouse';

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  try {
    const { wsId, productId, unitId } = req.query;

    if (!wsId || typeof wsId !== 'string') throw new Error('Invalid wsId');

    if (!productId || typeof productId !== 'string')
      throw new Error('Invalid productId');

    if (!unitId || typeof unitId !== 'string')
      throw new Error('Invalid unitId');

    switch (req.method) {
      case 'GET':
        return await fetchWarehouses(req, res, productId, unitId);

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

const fetchWarehouses = async (
  req: NextApiRequest,
  res: NextApiResponse,
  productId: string,
  unitId: string
) => {
  const supabase = createServerSupabaseClient({ req, res });

  const { data, error } = await supabase
    .from('inventory_warehouses')
    .select('id, name, inventory_products!inner(product_id, unit_id)')
    .eq('inventory_products.product_id', productId)
    .eq('inventory_products.unit_id', unitId);

  if (error) return res.status(500).json({ error: error.message });
  if (!data) return res.status(404).json({ error: 'Not found' });

  return res.status(200).json(data as ProductWarehouse[]);
};

export default handler;
