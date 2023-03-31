import { createServerSupabaseClient } from '@supabase/auth-helpers-nextjs';
import type { NextApiRequest, NextApiResponse } from 'next';
import { Prescription } from '../../../../../../../types/primitives/Prescription';

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  try {
    const { prescriptionId } = req.query;

    if (!prescriptionId || typeof prescriptionId !== 'string')
      throw new Error('Invalid prescriptionId');

    switch (req.method) {
      case 'GET':
        return await fetchPrescription(req, res, prescriptionId);

      case 'PUT': {
        return await updatePrescription(req, res, prescriptionId);
      }

      case 'DELETE': {
        return await deletePrescription(req, res, prescriptionId);
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

const fetchPrescription = async (
  req: NextApiRequest,
  res: NextApiResponse,
  prescriptionId: string
) => {
  const supabase = createServerSupabaseClient({ req, res });

  const { data, error } = await supabase
    .from('healthcare_prescriptions')
    .select(
      'id, patient_id, creator_id, price, price_diff, advice, note, completed_at, created_at'
    )
    .eq('id', prescriptionId)
    .single();

  if (error) return res.status(500).json({ error: error.message });
  if (!data) return res.status(404).json({ error: 'Not found' });

  return res.status(200).json(data);
};

const updatePrescription = async (
  req: NextApiRequest,
  res: NextApiResponse,
  prescriptionId: string
) => {
  const supabase = createServerSupabaseClient({
    req,
    res,
  });

  const { patient_id, price, price_diff, advice, note } =
    req.body as Prescription;

  const { error } = await supabase
    .from('healthcare_prescriptions')
    .update({
      patient_id: patient_id || null,
      price,
      price_diff,
      advice,
      note,
    })
    .eq('id', prescriptionId);

  if (error) return res.status(401).json({ error: error.message });
  return res.status(200).json({});
};

const deletePrescription = async (
  req: NextApiRequest,
  res: NextApiResponse,
  prescriptionId: string
) => {
  const supabase = createServerSupabaseClient({
    req,
    res,
  });

  const { error } = await supabase
    .from('healthcare_prescriptions')
    .delete()
    .eq('id', prescriptionId);

  if (error) return res.status(401).json({ error: error.message });
  return res.status(200).json({});
};

export default handler;
