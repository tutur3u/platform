import { createServerSupabaseClient } from '@supabase/auth-helpers-nextjs';
import type { NextApiRequest, NextApiResponse } from 'next';
import { VitalGroup } from '../../../../../../../types/primitives/VitalGroup';

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  try {
    const { groupId } = req.query;

    if (!groupId || typeof groupId !== 'string')
      throw new Error('Invalid groupId');

    switch (req.method) {
      case 'GET':
        return await fetchVitalGroup(req, res, groupId);

      case 'PUT': {
        return await updateVitalGroup(req, res, groupId);
      }

      case 'DELETE': {
        return await deleteVitalGroup(req, res, groupId);
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

const fetchVitalGroup = async (
  req: NextApiRequest,
  res: NextApiResponse,
  groupId: string
) => {
  const supabase = createServerSupabaseClient({ req, res });

  const { data, error } = await supabase
    .from('healthcare_vital_groups')
    .select('id, name, description, note')
    .eq('id', groupId)
    .single();

  if (error) return res.status(500).json({ error: error.message });
  if (!data) return res.status(404).json({ error: 'Not found' });

  return res.status(200).json(data);
};

const updateVitalGroup = async (
  req: NextApiRequest,
  res: NextApiResponse,
  groupId: string
) => {
  const supabase = createServerSupabaseClient({
    req,
    res,
  });

  const { name, description, note } = req.body as VitalGroup;

  const { error } = await supabase
    .from('healthcare_vital_groups')
    .update({
      name,
      description,
      note,
    })
    .eq('id', groupId);

  if (error) return res.status(401).json({ error: error.message });
  return res.status(200).json({});
};

const deleteVitalGroup = async (
  req: NextApiRequest,
  res: NextApiResponse,
  groupId: string
) => {
  const supabase = createServerSupabaseClient({
    req,
    res,
  });

  const { error } = await supabase
    .from('healthcare_vital_groups')
    .delete()
    .eq('id', groupId);

  if (error) return res.status(401).json({ error: error.message });
  return res.status(200).json({});
};

export default handler;
