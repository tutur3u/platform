import { createPagesServerClient } from '@supabase/auth-helpers-nextjs';
import type { NextApiRequest, NextApiResponse } from 'next';

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  try {
    const { diagnosisId } = req.query;

    if (!diagnosisId || typeof diagnosisId !== 'string')
      throw new Error('Invalid diagnosisId');

    switch (req.method) {
      case 'GET':
        return await fetchDiagnosis(req, res, diagnosisId);

      case 'PUT': {
        return await updateDiagnosis(req, res, diagnosisId);
      }

      case 'DELETE': {
        return await deleteDiagnosis(req, res, diagnosisId);
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

const fetchDiagnosis = async (
  req: NextApiRequest,
  res: NextApiResponse,
  diagnosisId: string
) => {
  const supabase = createPagesServerClient({ req, res });

  const { data, error } = await supabase
    .from('healthcare_diagnoses')
    .select('id, name, description, note')
    .eq('id', diagnosisId)
    .single();

  if (error) return res.status(500).json({ error: error.message });
  if (!data) return res.status(404).json({ error: 'Not found' });

  return res.status(200).json(data);
};

const updateDiagnosis = async (
  req: NextApiRequest,
  res: NextApiResponse,
  diagnosisId: string
) => {
  const supabase = createPagesServerClient({
    req,
    res,
  });

  const { name, description, note } = req.body;

  const { error } = await supabase
    .from('healthcare_diagnoses')
    .update({
      name,
      description,
      note,
    })
    .eq('id', diagnosisId);

  if (error) return res.status(401).json({ error: error.message });
  return res.status(200).json({});
};

const deleteDiagnosis = async (
  req: NextApiRequest,
  res: NextApiResponse,
  diagnosisId: string
) => {
  const supabase = createPagesServerClient({
    req,
    res,
  });

  const { error } = await supabase
    .from('healthcare_diagnoses')
    .delete()
    .eq('id', diagnosisId);

  if (error) return res.status(401).json({ error: error.message });
  return res.status(200).json({});
};

export default handler;
