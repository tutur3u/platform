import { createServerSupabaseClient } from '@supabase/auth-helpers-nextjs';
import type { NextApiRequest, NextApiResponse } from 'next';

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  try {
    const { wsId } = req.query;

    if (!wsId || typeof wsId !== 'string') throw new Error('Invalid wsId');

    switch (req.method) {
      case 'GET':
        return await fetchProducts(req, res, wsId);

      case 'POST':
        return await createProduct(req, res, wsId);

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

const fetchProducts = async (
  req: NextApiRequest,
  res: NextApiResponse,
  wsId: string
) => {
  const supabase = createServerSupabaseClient({
    req,
    res,
  });

  const { categoryIds, unique, hasUnit } = req.query;

  if (unique) {
    const queryBuilder = supabase
      .from('workspace_products')
      .select('id, name, manufacturer, description, usage, category_id');

    const { data, error } = await queryBuilder;

    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json(data);
  } else {
    const { data, error } = await supabase.rpc('get_inventory_products', {
      _ws_id: wsId,
      _category_ids: categoryIds
        ? typeof categoryIds === 'string'
          ? categoryIds.split(',')
          : categoryIds
        : null,
      _has_unit: hasUnit ? hasUnit === 'true' : null,
    });

    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json(data);
  }
};

const createProduct = async (
  req: NextApiRequest,
  res: NextApiResponse,
  wsId: string
) => {
  const supabase = createServerSupabaseClient({
    req,
    res,
  });

  const { name, manufacturer, description, usage, category_id } = JSON.parse(
    req.body
  );

  const { data, error } = await supabase
    .from('workspace_products')
    .insert({
      name,
      manufacturer,
      description,
      usage,
      category_id,
      ws_id: wsId,
    })
    .select('id')
    .single();

  if (error) return res.status(401).json({ error: error.message });
  return res.status(200).json({ id: data.id });
};
