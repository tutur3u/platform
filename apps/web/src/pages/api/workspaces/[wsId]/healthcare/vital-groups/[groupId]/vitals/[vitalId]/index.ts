import { createServerSupabaseClient } from '@supabase/auth-helpers-nextjs';
import type { NextApiRequest, NextApiResponse } from 'next';

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  try {
    const { groupId, vitalId } = req.query;

    if (!groupId || typeof groupId !== 'string')
      throw new Error('Invalid groupId');

    if (!vitalId || typeof vitalId !== 'string')
      throw new Error('Invalid vitalId');

    switch (req.method) {
      case 'DELETE': {
        return await deleteVital(req, res, groupId, vitalId);
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

const deleteVital = async (
  req: NextApiRequest,
  res: NextApiResponse,
  groupId: string,
  vitalId: string
) => {
  const supabase = createServerSupabaseClient({
    req,
    res,
  });

  const { error } = await supabase
    .from('vital_group_vitals')
    .delete()
    .eq('group_id', groupId)
    .eq('vital_id', vitalId);

  if (error) return res.status(401).json({ error: error.message });
  return res.status(200).json({});
};

export default handler;
