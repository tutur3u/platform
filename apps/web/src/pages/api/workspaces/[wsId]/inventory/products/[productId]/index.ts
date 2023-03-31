import { createServerSupabaseClient } from '@supabase/auth-helpers-nextjs';
import type { NextApiRequest, NextApiResponse } from 'next';
import { Product } from '../../../../../../../types/primitives/Product';

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  try {
    const { productId } = req.query;

    if (!productId || typeof productId !== 'string')
      throw new Error('Invalid productId');

    switch (req.method) {
      case 'GET':
        return await fetchProduct(req, res, productId);

      case 'PUT': {
        return await updateProduct(req, res, productId);
      }

      case 'DELETE': {
        return await deleteProduct(req, res, productId);
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

const fetchProduct = async (
  req: NextApiRequest,
  res: NextApiResponse,
  productId: string
) => {
  const supabase = createServerSupabaseClient({ req, res });

  const { data, error } = await supabase
    .from('workspace_products')
    .select('id, name, manufacturer, description, usage, category_id')
    .eq('id', productId)
    .single();

  if (error) return res.status(500).json({ error: error.message });
  if (!data) return res.status(404).json({ error: 'Not found' });

  return res.status(200).json(data);
};

const updateProduct = async (
  req: NextApiRequest,
  res: NextApiResponse,
  productId: string
) => {
  const supabase = createServerSupabaseClient({
    req,
    res,
  });

  const { name, manufacturer, description, usage, category_id } =
    req.body as Product;

  const { error } = await supabase
    .from('workspace_products')
    .update({
      name,
      manufacturer,
      description,
      usage,
      category_id,
    })
    .eq('id', productId);

  if (error) return res.status(401).json({ error: error.message });
  return res.status(200).json({});
};

const deleteProduct = async (
  req: NextApiRequest,
  res: NextApiResponse,
  productId: string
) => {
  const supabase = createServerSupabaseClient({
    req,
    res,
  });

  const { error } = await supabase
    .from('workspace_products')
    .delete()
    .eq('id', productId);

  if (error) return res.status(401).json({ error: error.message });
  return res.status(200).json({});
};

export default handler;
