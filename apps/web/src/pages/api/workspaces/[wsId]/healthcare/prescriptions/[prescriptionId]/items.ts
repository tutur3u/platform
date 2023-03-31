import { createServerSupabaseClient } from '@supabase/auth-helpers-nextjs';
import type { NextApiRequest, NextApiResponse } from 'next';

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  try {
    const { prescriptionId } = req.query;

    if (!prescriptionId || typeof prescriptionId !== 'string')
      throw new Error('Invalid prescriptionId');

    switch (req.method) {
      case 'GET':
        return await fetchItems(req, res, prescriptionId);

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
  prescriptionId: string
) => {
  const supabase = createServerSupabaseClient({ req, res });

  const { data, error } = await supabase
    .from('healthcare_prescription_products')
    .select('amount')
    .eq('prescription_id', prescriptionId);

  if (error) return res.status(500).json({ error: error.message });
  if (!data) return res.status(404).json({ error: 'Not found' });

  return res
    .status(200)
    .json({ count: data.reduce((acc, item) => acc + (item?.amount || 0), 0) });
};

export default handler;
