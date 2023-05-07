import { createServerSupabaseClient } from '@supabase/auth-helpers-nextjs';
import type { NextApiRequest, NextApiResponse } from 'next';
import { Product } from '../../../../../../types/primitives/Product';

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

  const {
    warehouseIds,
    categoryIds,
    unique,
    hasUnit,
    blacklist,
    query,
    page,
    itemsPerPage,
  } = req.query;

  if (unique) {
    const queryBuilder = supabase
      .from('workspace_products')
      .select(
        'id, name, manufacturer, description, usage, category_id, inventory_products!inner(warehouse_id)',
        {
          count: 'exact',
        }
      )
      .eq('ws_id', wsId);

    if (query) queryBuilder.ilike('name', `%${query}%`);

    if (warehouseIds && typeof warehouseIds === 'string') {
      queryBuilder.eq('inventory_products.warehouse_id', warehouseIds);
    }

    if (blacklist && typeof blacklist === 'string' && !hasUnit) {
      queryBuilder.not('id', 'in', `(${blacklist})`);
    }

    if (
      page &&
      itemsPerPage &&
      typeof page === 'string' &&
      typeof itemsPerPage === 'string'
    ) {
      const parsedPage = parseInt(page);
      const parsedSize = parseInt(itemsPerPage);

      const start = (parsedPage - 1) * parsedSize;
      const end = parsedPage * parsedSize;

      queryBuilder.range(start, end).limit(parsedSize);
    }

    const { count, data, error } = await queryBuilder;

    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ data, count });
  } else {
    const queryBuilder = supabase
      .rpc(
        'get_inventory_products',
        {
          _category_ids: categoryIds
            ? typeof categoryIds === 'string'
              ? categoryIds.split(',')
              : categoryIds
            : null,
          _warehouse_ids: warehouseIds
            ? typeof warehouseIds === 'string'
              ? warehouseIds.split(',')
              : warehouseIds
            : null,
          _ws_id: wsId,
          _has_unit: hasUnit ? hasUnit === 'true' : null,
        },
        {
          count: 'exact',
        }
      )
      .order('created_at', { ascending: false });

    if (query) queryBuilder.ilike('name', `%${query}%`);

    if (
      page &&
      itemsPerPage &&
      typeof page === 'string' &&
      typeof itemsPerPage === 'string'
    ) {
      const parsedPage = parseInt(page);
      const parsedSize = parseInt(itemsPerPage);

      const start = (parsedPage - 1) * parsedSize;
      const end = parsedPage * parsedSize;

      queryBuilder.range(start, end).limit(parsedSize);
    }

    const { count, data, error } = await queryBuilder;

    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ data, count });
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

  const { name, manufacturer, description, usage, category_id } =
    req.body as Product;

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
