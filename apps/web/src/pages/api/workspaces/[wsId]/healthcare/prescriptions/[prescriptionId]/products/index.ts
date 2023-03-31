import { Product } from './../../../../../../../../types/primitives/Product';
import { createServerSupabaseClient } from '@supabase/auth-helpers-nextjs';
import type { NextApiRequest, NextApiResponse } from 'next';

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  try {
    const { prescriptionId } = req.query;

    if (!prescriptionId || typeof prescriptionId !== 'string')
      throw new Error('Invalid prescriptionId');

    switch (req.method) {
      case 'GET':
        return await fetchProducts(req, res, prescriptionId);

      case 'POST': {
        return await addProducts(req, res, prescriptionId);
      }

      case 'DELETE': {
        return await deleteProducts(req, res, prescriptionId);
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

const fetchProducts = async (
  req: NextApiRequest,
  res: NextApiResponse,
  prescriptionId: string
) => {
  const supabase = createServerSupabaseClient({ req, res });

  const { data, error } = await supabase
    .from('healthcare_prescription_products')
    .select('amount, price, id:product_id, unit_id')
    .eq('prescription_id', prescriptionId);

  if (error) return res.status(500).json({ error: error.message });
  if (!data) return res.status(404).json({ error: 'Not found' });

  return res.status(200).json(data);
};

const addProducts = async (
  req: NextApiRequest,
  res: NextApiResponse,
  prescriptionId: string
) => {
  const supabase = createServerSupabaseClient({
    req,
    res,
  });

  const { products } = req.body as { products: Product[] };

  const { error } = await supabase
    .from('healthcare_prescription_products')
    .insert(
      products.map((p) => ({
        price: p.price,
        amount: p.amount,
        product_id: p.id,
        unit_id: p.unit_id,
        prescription_id: prescriptionId,
      }))
    );

  if (error) return res.status(401).json({ error: error.message });
  return res.status(200).json({});
};

const deleteProducts = async (
  req: NextApiRequest,
  res: NextApiResponse,
  prescriptionId: string
) => {
  const supabase = createServerSupabaseClient({
    req,
    res,
  });

  const { error } = await supabase
    .from('healthcare_prescription_products')
    .delete()
    .eq('prescription_id', prescriptionId);

  if (error) return res.status(401).json({ error: error.message });
  return res.status(200).json({});
};

export default handler;
