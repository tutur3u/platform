import { createServerSupabaseClient } from '@supabase/auth-helpers-nextjs';
import type { NextApiRequest, NextApiResponse } from 'next';
import { Invoice } from '../../../../../../../types/primitives/Invoice';

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  try {
    const { invoiceId } = req.query;

    if (!invoiceId || typeof invoiceId !== 'string')
      throw new Error('Invalid invoiceId');

    switch (req.method) {
      case 'GET':
        return await fetchInvoice(req, res, invoiceId);

      case 'PUT': {
        return await updateInvoice(req, res, invoiceId);
      }

      case 'DELETE': {
        return await deleteInvoice(req, res, invoiceId);
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

const fetchInvoice = async (
  req: NextApiRequest,
  res: NextApiResponse,
  invoiceId: string
) => {
  const supabase = createServerSupabaseClient({ req, res });

  const { data, error } = await supabase
    .from('finance_invoices')
    .select(
      'id, customer_id, creator_id, price, price_diff, notice, note, completed_at, created_at'
    )
    .eq('id', invoiceId)
    .single();

  if (error) return res.status(500).json({ error: error.message });
  if (!data) return res.status(404).json({ error: 'Not found' });

  return res.status(200).json(data);
};

const updateInvoice = async (
  req: NextApiRequest,
  res: NextApiResponse,
  invoiceId: string
) => {
  const supabase = createServerSupabaseClient({
    req,
    res,
  });

  const { customer_id, price, price_diff, notice, note } = req.body as Invoice;

  const { error } = await supabase
    .from('finance_invoices')
    .update({
      customer_id: customer_id || null,
      price,
      price_diff,
      notice,
      note,
    })
    .eq('id', invoiceId);

  if (error) return res.status(401).json({ error: error.message });
  return res.status(200).json({});
};

const deleteInvoice = async (
  req: NextApiRequest,
  res: NextApiResponse,
  invoiceId: string
) => {
  const supabase = createServerSupabaseClient({
    req,
    res,
  });

  const { error } = await supabase
    .from('finance_invoices')
    .delete()
    .eq('id', invoiceId);

  if (error) return res.status(401).json({ error: error.message });
  return res.status(200).json({});
};

export default handler;
