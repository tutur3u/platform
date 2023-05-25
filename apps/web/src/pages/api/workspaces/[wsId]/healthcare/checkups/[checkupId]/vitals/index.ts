import { createPagesServerClient } from '@supabase/auth-helpers-nextjs';
import type { NextApiRequest, NextApiResponse } from 'next';
import { Vital } from '../../../../../../../../types/primitives/Vital';

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  try {
    const { checkupId } = req.query;

    if (!checkupId || typeof checkupId !== 'string')
      throw new Error('Invalid checkupId');

    switch (req.method) {
      case 'GET':
        return await fetchVitals(req, res, checkupId);

      case 'POST': {
        return await addVitals(req, res, checkupId);
      }

      case 'DELETE': {
        return await deleteVitals(req, res, checkupId);
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
  checkupId: string
) => {
  const supabase = createPagesServerClient({ req, res });

  const { data, error } = await supabase
    .from('healthcare_checkup_vitals')
    .select('id:vital_id, value, healthcare_vitals(unit)')
    .eq('checkup_id', checkupId);

  if (error) return res.status(500).json({ error: error.message });
  if (!data) return res.status(404).json({ error: 'Not found' });

  return res.status(200).json(
    data.map((v) => {
      const { id, value, healthcare_vitals } = v;
      return {
        id,
        value,
        unit: Array.isArray(healthcare_vitals) ? null : healthcare_vitals?.unit,
      };
    })
  );
};

const addVitals = async (
  req: NextApiRequest,
  res: NextApiResponse,
  checkupId: string
) => {
  const supabase = createPagesServerClient({
    req,
    res,
  });

  const { vitals } = req.body as { vitals: Vital[] };

  const { error } = await supabase.from('healthcare_checkup_vitals').insert(
    vitals.map((v) => ({
      vital_id: v.id,
      checkup_id: checkupId,
      value: v.value,
    }))
  );

  if (error) return res.status(401).json({ error: error.message });
  return res.status(200).json({});
};

const deleteVitals = async (
  req: NextApiRequest,
  res: NextApiResponse,
  checkupId: string
) => {
  const supabase = createPagesServerClient({
    req,
    res,
  });

  const { error } = await supabase
    .from('healthcare_checkup_vitals')
    .delete()
    .eq('checkup_id', checkupId);

  if (error) return res.status(401).json({ error: error.message });
  return res.status(200).json({});
};

export default handler;
