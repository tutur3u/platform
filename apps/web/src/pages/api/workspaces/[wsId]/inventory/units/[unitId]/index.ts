import { createPagesServerClient } from '@supabase/auth-helpers-nextjs';
import type { NextApiRequest, NextApiResponse } from 'next';

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  try {
    const { unitId } = req.query;

    if (!unitId || typeof unitId !== 'string')
      throw new Error('Invalid unitId');

    switch (req.method) {
      case 'GET':
        return await fetchUnit(req, res, unitId);

      case 'PUT': {
        return await updateUnit(req, res, unitId);
      }

      case 'DELETE': {
        return await deleteUnit(req, res, unitId);
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

const fetchUnit = async (
  req: NextApiRequest,
  res: NextApiResponse,
  unitId: string
) => {
  const supabase = createPagesServerClient({ req, res });

  const { data, error } = await supabase
    .from('inventory_units')
    .select('id, name')
    .eq('id', unitId)
    .single();

  if (error) return res.status(500).json({ error: error.message });
  if (!data) return res.status(404).json({ error: 'Not found' });

  return res.status(200).json(data);
};

const updateUnit = async (
  req: NextApiRequest,
  res: NextApiResponse,
  unitId: string
) => {
  const supabase = createPagesServerClient({
    req,
    res,
  });

  const { name } = req.body;

  const { error } = await supabase
    .from('inventory_units')
    .update({
      name,
    })
    .eq('id', unitId);

  if (error) return res.status(401).json({ error: error.message });
  return res.status(200).json({});
};

const deleteUnit = async (
  req: NextApiRequest,
  res: NextApiResponse,
  unitId: string
) => {
  const supabase = createPagesServerClient({
    req,
    res,
  });

  const { error } = await supabase
    .from('inventory_units')
    .delete()
    .eq('id', unitId);

  if (error) return res.status(401).json({ error: error.message });
  return res.status(200).json({});
};

export default handler;
