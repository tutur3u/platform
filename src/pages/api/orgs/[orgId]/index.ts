import { createServerSupabaseClient } from '@supabase/auth-helpers-nextjs';
import type { NextApiRequest, NextApiResponse } from 'next';

const updateOrg = async (
  req: NextApiRequest,
  res: NextApiResponse,
  orgId: string
) => {
  const supabase = createServerSupabaseClient({
    req,
    res,
  });

  const { name } = JSON.parse(req.body);

  const data = {
    name,
  };

  const { error } = await supabase.from('orgs').update(data).eq('id', orgId);

  if (error) return res.status(401).json({ error: error.message });
  return res.status(200).json({ message: 'success' });
};

const deleteOrg = async (
  req: NextApiRequest,
  res: NextApiResponse,
  orgId: string
) => {
  const supabase = createServerSupabaseClient({
    req,
    res,
  });

  const { data, error } = await supabase.from('orgs').delete().eq('id', orgId);

  if (error) return res.status(401).json({ error: error.message });
  return res.status(200).json(data);
};

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  try {
    const { orgId } = req.query;

    if (
      !orgId ||
      typeof orgId !== 'string' ||
      orgId === '00000000-0000-0000-0000-000000000000'
    )
      throw new Error('Invalid orgId');

    switch (req.method) {
      case 'PUT':
        return await updateOrg(req, res, orgId);

      case 'DELETE':
        return await deleteOrg(req, res, orgId);

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
