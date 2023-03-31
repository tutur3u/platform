import { createServerSupabaseClient } from '@supabase/auth-helpers-nextjs';
import type { NextApiRequest, NextApiResponse } from 'next';
import { Checkup } from '../../../../../../../types/primitives/Checkup';

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  try {
    const { checkupId } = req.query;

    if (!checkupId || typeof checkupId !== 'string')
      throw new Error('Invalid checkupId');

    switch (req.method) {
      case 'GET':
        return await fetchCheckup(req, res, checkupId);

      case 'PUT': {
        return await updateCheckup(req, res, checkupId);
      }

      case 'DELETE': {
        return await deleteCheckup(req, res, checkupId);
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

const fetchCheckup = async (
  req: NextApiRequest,
  res: NextApiResponse,
  checkupId: string
) => {
  const supabase = createServerSupabaseClient({ req, res });

  const { data, error } = await supabase
    .from('healthcare_checkups')
    .select(
      'id, patient_id, diagnosis_id, note, checked, checkup_at, next_checked, next_checkup_at, completed_at, creator_id, created_at'
    )
    .eq('id', checkupId)
    .single();

  if (error) return res.status(500).json({ error: error.message });
  if (!data) return res.status(404).json({ error: 'Not found' });

  return res.status(200).json(data as Checkup);
};

const updateCheckup = async (
  req: NextApiRequest,
  res: NextApiResponse,
  checkupId: string
) => {
  const supabase = createServerSupabaseClient({
    req,
    res,
  });

  const {
    patient_id,
    diagnosis_id,
    note,
    checked,
    checkup_at,
    next_checked,
    next_checkup_at,
  } = req.body as Checkup;

  const { error } = await supabase
    .from('healthcare_checkups')
    .update({
      patient_id,
      diagnosis_id,
      note,
      checked,
      checkup_at,
      next_checked,
      next_checkup_at,
      completed_at:
        checked && (next_checked || !next_checkup_at) ? 'now()' : null,
    })
    .eq('id', checkupId);

  if (error) return res.status(401).json({ error: error.message });
  return res.status(200).json({});
};

const deleteCheckup = async (
  req: NextApiRequest,
  res: NextApiResponse,
  checkupId: string
) => {
  const supabase = createServerSupabaseClient({
    req,
    res,
  });

  const { error } = await supabase
    .from('healthcare_checkups')
    .delete()
    .eq('id', checkupId);

  if (error) return res.status(401).json({ error: error.message });
  return res.status(200).json({});
};

export default handler;
