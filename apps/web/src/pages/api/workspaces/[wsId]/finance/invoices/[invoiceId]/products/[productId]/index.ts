import { createPagesServerClient } from '@supabase/auth-helpers-nextjs';
import type { NextApiRequest, NextApiResponse } from 'next';

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  try {
    const { invoiceId, productId, unitId } = req.query;

    if (!invoiceId || typeof invoiceId !== 'string')
      throw new Error('Invalid invoiceId');

    if (!productId || typeof productId !== 'string')
      throw new Error('Invalid productId');

    if (!unitId || typeof unitId !== 'string')
      throw new Error('Invalid unitId');

    switch (req.method) {
      case 'GET':
        return await fetchProduct(req, res, invoiceId, productId, unitId);

      case 'PUT': {
        return await updateProduct(req, res, invoiceId, productId, unitId);
      }

      case 'DELETE': {
        return await deleteProduct(req, res, invoiceId, productId, unitId);
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
  invoiceId: string,
  productId: string,
  unitId: string
) => {
  const supabase = createPagesServerClient({ req, res });

  const { data, error } = await supabase
    .from('finance_invoice_products')
    .select('amount, price')
    .eq('invoice_id', invoiceId)
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
  invoiceId: string,
  productId: string,
  unitId: string
) => {
  const supabase = createPagesServerClient({
    req,
    res,
  });

  const { amount, price } = req.body;

  const { error } = await supabase
    .from('finance_invoice_products')
    .update({
      product_id: productId,
      unit_id: unitId,
      amount,
      price,
    })
    .eq('invoice_id', invoiceId)
    .eq('product_id', productId)
    .eq('unit_id', unitId);

  if (error) return res.status(401).json({ error: error.message });
  return res.status(200).json({});
};

const deleteProduct = async (
  req: NextApiRequest,
  res: NextApiResponse,
  invoiceId: string,
  productId: string,
  unitId: string
) => {
  const supabase = createPagesServerClient({
    req,
    res,
  });

  const { error } = await supabase
    .from('finance_invoice_products')
    .delete()
    .eq('invoice_id', invoiceId)
    .eq('product_id', productId)
    .eq('unit_id', unitId);

  if (error) return res.status(401).json({ error: error.message });
  return res.status(200).json({});
};

export default handler;
