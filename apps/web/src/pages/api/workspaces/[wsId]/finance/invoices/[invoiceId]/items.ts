import { createPagesServerClient } from '@supabase/auth-helpers-nextjs';
import type { NextApiRequest, NextApiResponse } from 'next';

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  try {
    const { invoiceId } = req.query;

    if (!invoiceId || typeof invoiceId !== 'string')
      throw new Error('Invalid invoiceId');

    switch (req.method) {
      case 'GET':
        return await fetchItems(req, res, invoiceId);

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

const fetchItems = async (
  req: NextApiRequest,
  res: NextApiResponse,
  invoiceId: string
) => {
  const supabase = createPagesServerClient({ req, res });

  const { data, error } = await supabase
    .from('finance_invoice_products')
    .select('amount')
    .eq('invoice_id', invoiceId);

  if (error) return res.status(500).json({ error: error.message });
  if (!data) return res.status(404).json({ error: 'Not found' });

  return res
    .status(200)
    .json({ count: data.reduce((acc, item) => acc + (item?.amount || 0), 0) });
};

export default handler;
