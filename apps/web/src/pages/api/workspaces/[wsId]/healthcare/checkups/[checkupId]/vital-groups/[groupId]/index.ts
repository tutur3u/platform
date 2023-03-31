import { createServerSupabaseClient } from '@supabase/auth-helpers-nextjs';
import type { NextApiRequest, NextApiResponse } from 'next';

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  try {
    const { checkupId, groupId } = req.query;

    if (!checkupId || typeof checkupId !== 'string')
      throw new Error('Invalid checkupId');

    if (!groupId || typeof groupId !== 'string')
      throw new Error('Invalid groupId');

    switch (req.method) {
      case 'DELETE': {
        return await deleteVitalGroup(req, res, checkupId, groupId);
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

const deleteVitalGroup = async (
  req: NextApiRequest,
  res: NextApiResponse,
  checkupId: string,
  groupId: string
) => {
  const supabase = createServerSupabaseClient({
    req,
    res,
  });

  const { error } = await supabase
    .from('healthcare_checkup_vital_groups')
    .delete()
    .eq('checkup_id', checkupId)
    .eq('group_id', groupId);

  if (error) return res.status(401).json({ error: error.message });
  return res.status(200).json({});
};

export default handler;
