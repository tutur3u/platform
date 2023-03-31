import { createServerSupabaseClient } from '@supabase/auth-helpers-nextjs';
import type { NextApiRequest, NextApiResponse } from 'next';

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  try {
    const { prescriptionId, productId, unitId } = req.query;

    if (!prescriptionId || typeof prescriptionId !== 'string')
      throw new Error('Invalid prescriptionId');

    if (!productId || typeof productId !== 'string')
      throw new Error('Invalid productId');

    if (!unitId || typeof unitId !== 'string')
      throw new Error('Invalid unitId');

    switch (req.method) {
      case 'GET':
        return await fetchProduct(req, res, prescriptionId, productId, unitId);

      case 'PUT': {
        return await updateProduct(req, res, prescriptionId, productId, unitId);
      }

      case 'DELETE': {
        return await deleteProduct(req, res, prescriptionId, productId, unitId);
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

const fetchProduct = async (
  req: NextApiRequest,
  res: NextApiResponse,
  prescriptionId: string,
  productId: string,
  unitId: string
) => {
  const supabase = createServerSupabaseClient({ req, res });

  const { data, error } = await supabase
    .from('healthcare_prescription_products')
    .select('amount, price')
    .eq('prescription_id', prescriptionId)
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
  prescriptionId: string,
  productId: string,
  unitId: string
) => {
  const supabase = createServerSupabaseClient({
    req,
    res,
  });

  const { amount, price } = req.body;

  const { error } = await supabase
    .from('healthcare_prescription_products')
    .update({
      product_id: productId,
      unit_id: unitId,
      amount,
      price,
    })
    .eq('prescription_id', prescriptionId)
    .eq('product_id', productId)
    .eq('unit_id', unitId);

  if (error) return res.status(401).json({ error: error.message });
  return res.status(200).json({});
};

const deleteProduct = async (
  req: NextApiRequest,
  res: NextApiResponse,
  prescriptionId: string,
  productId: string,
  unitId: string
) => {
  const supabase = createServerSupabaseClient({
    req,
    res,
  });

  const { error } = await supabase
    .from('healthcare_prescription_products')
    .delete()
    .eq('prescription_id', prescriptionId)
    .eq('product_id', productId)
    .eq('unit_id', unitId);

  if (error) return res.status(401).json({ error: error.message });
  return res.status(200).json({});
};

export default handler;
