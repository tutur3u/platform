import { createPagesServerClient } from '@supabase/auth-helpers-nextjs';
import type { NextApiRequest, NextApiResponse } from 'next';

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  try {
    const { supplierId } = req.query;

    if (!supplierId || typeof supplierId !== 'string')
      throw new Error('Invalid supplierId');

    switch (req.method) {
      case 'GET':
        return await fetchSupplier(req, res, supplierId);

      case 'PUT': {
        return await updateSupplier(req, res, supplierId);
      }

      case 'DELETE': {
        return await deleteSupplier(req, res, supplierId);
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

const fetchSupplier = async (
  req: NextApiRequest,
  res: NextApiResponse,
  supplierId: string
) => {
  const supabase = createPagesServerClient({ req, res });

  const { data, error } = await supabase
    .from('inventory_suppliers')
    .select('id, name')
    .eq('id', supplierId)
    .single();

  if (error) return res.status(500).json({ error: error.message });
  if (!data) return res.status(404).json({ error: 'Not found' });

  return res.status(200).json(data);
};

const updateSupplier = async (
  req: NextApiRequest,
  res: NextApiResponse,
  supplierId: string
) => {
  const supabase = createPagesServerClient({
    req,
    res,
  });

  const { name } = req.body;

  const { error } = await supabase
    .from('inventory_suppliers')
    .update({
      name,
    })
    .eq('id', supplierId);

  if (error) return res.status(401).json({ error: error.message });
  return res.status(200).json({});
};

const deleteSupplier = async (
  req: NextApiRequest,
  res: NextApiResponse,
  supplierId: string
) => {
  const supabase = createPagesServerClient({
    req,
    res,
  });

  const { error } = await supabase
    .from('inventory_suppliers')
    .delete()
    .eq('id', supplierId);

  if (error) return res.status(401).json({ error: error.message });
  return res.status(200).json({});
};

export default handler;
