import { createPagesServerClient } from '@supabase/auth-helpers-nextjs';
import type { NextApiRequest, NextApiResponse } from 'next';

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  try {
    const { checkupId, vitalId } = req.query;

    if (!checkupId || typeof checkupId !== 'string')
      throw new Error('Invalid checkupId');

    if (!vitalId || typeof vitalId !== 'string')
      throw new Error('Invalid vitalId');

    switch (req.method) {
      case 'PUT': {
        return await updateVital(req, res, checkupId, vitalId);
      }

      case 'DELETE': {
        return await deleteVital(req, res, checkupId, vitalId);
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

const updateVital = async (
  req: NextApiRequest,
  res: NextApiResponse,
  checkupId: string,
  vitalId: string
) => {
  const supabase = createPagesServerClient({
    req,
    res,
  });

  const { value } = req.body;

  const { error } = await supabase
    .from('healthcare_checkup_vitals')
    .update({ value })
    .eq('checkup_id', checkupId)
    .eq('vital_id', vitalId);

  if (error) return res.status(401).json({ error: error.message });
  return res.status(200).json({});
};

const deleteVital = async (
  req: NextApiRequest,
  res: NextApiResponse,
  checkupId: string,
  vitalId: string
) => {
  const supabase = createPagesServerClient({
    req,
    res,
  });

  const { error } = await supabase
    .from('healthcare_checkup_vitals')
    .delete()
    .eq('checkup_id', checkupId)
    .eq('vital_id', vitalId);

  if (error) return res.status(401).json({ error: error.message });
  return res.status(200).json({});
};

export default handler;
