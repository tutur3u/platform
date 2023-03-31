import { createServerSupabaseClient } from '@supabase/auth-helpers-nextjs';
import type { NextApiRequest, NextApiResponse } from 'next';

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  try {
    const { promotionId } = req.query;

    if (!promotionId || typeof promotionId !== 'string')
      throw new Error('Invalid promotionId');

    switch (req.method) {
      case 'GET':
        return await fetchPromotion(req, res, promotionId);

      case 'PUT': {
        return await updatePromotion(req, res, promotionId);
      }

      case 'DELETE': {
        return await deletePromotion(req, res, promotionId);
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

const fetchPromotion = async (
  req: NextApiRequest,
  res: NextApiResponse,
  promotionId: string
) => {
  const supabase = createServerSupabaseClient({ req, res });

  const { data, error } = await supabase
    .from('product_promotions')
    .select('id, name')
    .eq('id', promotionId)
    .single();

  if (error) return res.status(500).json({ error: error.message });
  if (!data) return res.status(404).json({ error: 'Not found' });

  return res.status(200).json(data);
};

const updatePromotion = async (
  req: NextApiRequest,
  res: NextApiResponse,
  promotionId: string
) => {
  const supabase = createServerSupabaseClient({
    req,
    res,
  });

  const { name } = req.body;

  const { error } = await supabase
    .from('product_promotions')
    .update({
      name,
    })
    .eq('id', promotionId);

  if (error) return res.status(401).json({ error: error.message });
  return res.status(200).json({});
};

const deletePromotion = async (
  req: NextApiRequest,
  res: NextApiResponse,
  promotionId: string
) => {
  const supabase = createServerSupabaseClient({
    req,
    res,
  });

  const { error } = await supabase
    .from('product_promotions')
    .delete()
    .eq('id', promotionId);

  if (error) return res.status(401).json({ error: error.message });
  return res.status(200).json({});
};

export default handler;
