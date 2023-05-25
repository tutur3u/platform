import { createPagesServerClient } from '@supabase/auth-helpers-nextjs';
import type { NextApiRequest, NextApiResponse } from 'next';
import { VitalGroup } from '../../../../../../../../types/primitives/VitalGroup';

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  try {
    const { checkupId } = req.query;

    if (!checkupId || typeof checkupId !== 'string')
      throw new Error('Invalid checkupId');

    switch (req.method) {
      case 'GET':
        return await fetchVitalGroups(req, res, checkupId);

      case 'POST': {
        return await addVitalGroups(req, res, checkupId);
      }

      case 'DELETE': {
        return await deleteVitalGroups(req, res, checkupId);
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

const fetchVitalGroups = async (
  req: NextApiRequest,
  res: NextApiResponse,
  checkupId: string
) => {
  const supabase = createPagesServerClient({ req, res });

  const { data, error } = await supabase
    .from('healthcare_checkup_vital_groups')
    .select('id:group_id')
    .eq('checkup_id', checkupId);

  if (error) return res.status(500).json({ error: error.message });
  if (!data) return res.status(404).json({ error: 'Not found' });

  return res.status(200).json(data);
};

const addVitalGroups = async (
  req: NextApiRequest,
  res: NextApiResponse,
  checkupId: string
) => {
  const supabase = createPagesServerClient({
    req,
    res,
  });

  const { groups } = req.body as { groups: VitalGroup[] };

  const { error } = await supabase
    .from('healthcare_checkup_vital_groups')
    .insert(
      groups.map((v) => ({
        group_id: v.id,
        checkup_id: checkupId,
      }))
    );

  if (error) return res.status(401).json({ error: error.message });
  return res.status(200).json({});
};

const deleteVitalGroups = async (
  req: NextApiRequest,
  res: NextApiResponse,
  checkupId: string
) => {
  const supabase = createPagesServerClient({
    req,
    res,
  });

  const { error } = await supabase
    .from('healthcare_checkup_vital_groups')
    .delete()
    .eq('checkup_id', checkupId);

  if (error) return res.status(401).json({ error: error.message });
  return res.status(200).json({});
};

export default handler;
