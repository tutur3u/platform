import { createServerSupabaseClient } from '@supabase/auth-helpers-nextjs';
import type { NextApiRequest, NextApiResponse } from 'next';

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  try {
    const { invoiceId } = req.query;

    if (!invoiceId || typeof invoiceId !== 'string')
      throw new Error('Invalid invoiceId');

    switch (req.method) {
      case 'PUT': {
        return await updateStatus(req, res, invoiceId);
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

const updateStatus = async (
  req: NextApiRequest,
  res: NextApiResponse,
  invoiceId: string
) => {
  const supabase = createServerSupabaseClient({
    req,
    res,
  });

  const { completed } = req.body;

  const { error } = await supabase
    .from('finance_invoices')
    .update({
      completed_at: completed ? 'now()' : null,
    })
    .eq('id', invoiceId);

  if (error) return res.status(401).json({ error: error.message });
  return res.status(200).json({});
};

export default handler;
