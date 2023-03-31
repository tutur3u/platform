import { createServerSupabaseClient } from '@supabase/auth-helpers-nextjs';
import type { NextApiRequest, NextApiResponse } from 'next';
import { Prescription } from '../../../../../../types/primitives/Prescription';

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  try {
    const { wsId } = req.query;

    if (!wsId || typeof wsId !== 'string') throw new Error('Invalid wsId');

    switch (req.method) {
      case 'GET':
        return await fetchPrescriptions(req, res, wsId);

      case 'POST':
        return await createPrescription(req, res, wsId);

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

export default handler;

const fetchPrescriptions = async (
  req: NextApiRequest,
  res: NextApiResponse,
  wsId: string
) => {
  const supabase = createServerSupabaseClient({
    req,
    res,
  });

  const { status } = req.query;

  const queryBuilder = supabase
    .from('healthcare_prescriptions')
    .select(
      'id, patient_id, creator_id, price, price_diff, note, advice, completed_at, created_at'
    )
    .eq('ws_id', wsId)
    .order('created_at');

  if (status === 'completed') queryBuilder.not('completed_at', 'is', null);
  else if (status === 'incomplete') queryBuilder.is('completed_at', null);

  const { data, error } = await queryBuilder;

  if (error) return res.status(401).json({ error: error.message });
  return res.status(200).json(data);
};

const createPrescription = async (
  req: NextApiRequest,
  res: NextApiResponse,
  wsId: string
) => {
  const supabase = createServerSupabaseClient({
    req,
    res,
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  const { patient_id, price, price_diff, advice, note, completed_at } =
    req.body as Prescription;

  const { data, error } = await supabase
    .from('healthcare_prescriptions')
    .insert({
      patient_id: patient_id || null,
      price,
      price_diff,
      advice,
      note,
      creator_id: user.id,
      completed_at: completed_at ? 'now()' : null,
      ws_id: wsId,
    })
    .select('id')
    .single();

  if (error) return res.status(401).json({ error: error.message });
  return res.status(200).json({ id: data.id });
};
