import { createServerSupabaseClient } from '@supabase/auth-helpers-nextjs';
import type { NextApiRequest, NextApiResponse } from 'next';
import { Vital } from '../../../../../../../../types/primitives/Vital';

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  try {
    const { groupId } = req.query;

    if (!groupId || typeof groupId !== 'string')
      throw new Error('Invalid groupId');

    switch (req.method) {
      case 'GET':
        return await fetchVitals(req, res, groupId);

      case 'POST': {
        return await addVitals(req, res, groupId);
      }

      case 'DELETE': {
        return await deleteVitals(req, res, groupId);
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

const fetchVitals = async (
  req: NextApiRequest,
  res: NextApiResponse,
  groupId: string
) => {
  const supabase = createServerSupabaseClient({ req, res });

  const { data, error } = await supabase
    .from('vital_group_vitals')
    .select('id:vital_id')
    .eq('group_id', groupId);

  if (error) return res.status(500).json({ error: error.message });
  if (!data) return res.status(404).json({ error: 'Not found' });

  return res.status(200).json(data);
};

const addVitals = async (
  req: NextApiRequest,
  res: NextApiResponse,
  groupId: string
) => {
  const supabase = createServerSupabaseClient({
    req,
    res,
  });

  const { vitals } = req.body as { vitals: Vital[] };

  const { error } = await supabase.from('vital_group_vitals').insert(
    vitals.map((v) => ({
      vital_id: v.id,
      group_id: groupId,
    }))
  );

  if (error) return res.status(401).json({ error: error.message });
  return res.status(200).json({});
};

const deleteVitals = async (
  req: NextApiRequest,
  res: NextApiResponse,
  groupId: string
) => {
  const supabase = createServerSupabaseClient({
    req,
    res,
  });

  const { error } = await supabase
    .from('vital_group_vitals')
    .delete()
    .eq('group_id', groupId);

  if (error) return res.status(401).json({ error: error.message });
  return res.status(200).json({});
};

export default handler;
