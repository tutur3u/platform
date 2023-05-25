import { createPagesServerClient } from '@supabase/auth-helpers-nextjs';
import type { NextApiRequest, NextApiResponse } from 'next';

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  try {
    const { vitalId } = req.query;

    if (!vitalId || typeof vitalId !== 'string')
      throw new Error('Invalid vitalId');

    switch (req.method) {
      case 'GET':
        return await fetchVital(req, res, vitalId);

      case 'PUT': {
        return await updateVital(req, res, vitalId);
      }

      case 'DELETE': {
        return await deleteVital(req, res, vitalId);
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

const fetchVital = async (
  req: NextApiRequest,
  res: NextApiResponse,
  vitalId: string
) => {
  const supabase = createPagesServerClient({ req, res });

  const { data, error } = await supabase
    .from('healthcare_vitals')
    .select('id, name, unit')
    .eq('id', vitalId)
    .single();

  if (error) return res.status(500).json({ error: error.message });
  if (!data) return res.status(404).json({ error: 'Not found' });

  return res.status(200).json(data);
};

const updateVital = async (
  req: NextApiRequest,
  res: NextApiResponse,
  vitalId: string
) => {
  const supabase = createPagesServerClient({
    req,
    res,
  });

  const { name, unit } = req.body;

  const { error } = await supabase
    .from('healthcare_vitals')
    .update({
      name,
      unit,
    })
    .eq('id', vitalId);

  if (error) return res.status(401).json({ error: error.message });
  return res.status(200).json({});
};

const deleteVital = async (
  req: NextApiRequest,
  res: NextApiResponse,
  vitalId: string
) => {
  const supabase = createPagesServerClient({
    req,
    res,
  });

  const { error } = await supabase
    .from('healthcare_vitals')
    .delete()
    .eq('id', vitalId);

  if (error) return res.status(401).json({ error: error.message });
  return res.status(200).json({});
};

export default handler;
