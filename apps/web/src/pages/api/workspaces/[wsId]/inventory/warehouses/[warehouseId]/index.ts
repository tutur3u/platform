import { createPagesServerClient } from '@supabase/auth-helpers-nextjs';
import type { NextApiRequest, NextApiResponse } from 'next';

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  try {
    const { warehouseId } = req.query;

    if (!warehouseId || typeof warehouseId !== 'string')
      throw new Error('Invalid warehouseId');

    switch (req.method) {
      case 'GET':
        return await fetchWarehouse(req, res, warehouseId);

      case 'PUT': {
        return await updateWarehouse(req, res, warehouseId);
      }

      case 'DELETE': {
        return await deleteWarehouse(req, res, warehouseId);
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

const fetchWarehouse = async (
  req: NextApiRequest,
  res: NextApiResponse,
  warehouseId: string
) => {
  const supabase = createPagesServerClient({ req, res });

  const { data, error } = await supabase
    .from('inventory_warehouses')
    .select('id, name')
    .eq('id', warehouseId)
    .single();

  if (error) return res.status(500).json({ error: error.message });
  if (!data) return res.status(404).json({ error: 'Not found' });

  return res.status(200).json(data);
};

const updateWarehouse = async (
  req: NextApiRequest,
  res: NextApiResponse,
  warehouseId: string
) => {
  const supabase = createPagesServerClient({
    req,
    res,
  });

  const { name } = req.body;

  const { error } = await supabase
    .from('inventory_warehouses')
    .update({
      name,
    })
    .eq('id', warehouseId);

  if (error) return res.status(401).json({ error: error.message });
  return res.status(200).json({});
};

const deleteWarehouse = async (
  req: NextApiRequest,
  res: NextApiResponse,
  warehouseId: string
) => {
  const supabase = createPagesServerClient({
    req,
    res,
  });

  const { error } = await supabase
    .from('inventory_warehouses')
    .delete()
    .eq('id', warehouseId);

  if (error) return res.status(401).json({ error: error.message });
  return res.status(200).json({});
};

export default handler;
