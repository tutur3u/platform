import { createServerSupabaseClient } from '@supabase/auth-helpers-nextjs';
import type { NextApiRequest, NextApiResponse } from 'next';

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  try {
    const { prescriptionId } = req.query;

    if (!prescriptionId || typeof prescriptionId !== 'string')
      throw new Error('Invalid prescriptionId');

    switch (req.method) {
      case 'PUT': {
        return await updateStatus(req, res, prescriptionId);
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
  prescriptionId: string
) => {
  const supabase = createServerSupabaseClient({
    req,
    res,
  });

  const { completed } = req.body;

  const { error } = await supabase
    .from('healthcare_prescriptions')
    .update({
      completed_at: completed ? 'now()' : null,
    })
    .eq('id', prescriptionId);

  if (error) return res.status(401).json({ error: error.message });
  return res.status(200).json({});
};

export default handler;
