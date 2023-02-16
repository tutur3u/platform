import { createServerSupabaseClient } from '@supabase/auth-helpers-nextjs';
import type { NextApiRequest, NextApiResponse } from 'next';

const fetchOrgs = async (req: NextApiRequest, res: NextApiResponse) => {
  const supabase = createServerSupabaseClient({
    req,
    res,
  });

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError) return res.status(401).json({ error: userError.message });

  const currentOrgs = supabase
    .from('orgs')
    .select('id, name')
    .order('created_at');

  const invitedOrgs = supabase
    .from('org_invites')
    .select('created_at, orgs(id, name)')
    .eq('user_id', user?.id);

  // use Promise.all to run both queries in parallel
  const [current, invited] = await Promise.all([currentOrgs, invitedOrgs]);

  if (current.error)
    return res.status(401).json({ error: current.error.message });

  if (invited.error)
    return res.status(401).json({ error: invited.error.message });

  return res.status(200).json({
    current: current.data.map((org) => org),
    invited: invited.data.map((org) => ({
      ...org.orgs,
      created_at: org.created_at,
    })),
  });
};

const createOrg = async (req: NextApiRequest, res: NextApiResponse) => {
  const supabase = createServerSupabaseClient({
    req,
    res,
  });

  const { name } = JSON.parse(req.body);

  const { error } = await supabase
    .from('orgs')
    .insert({
      name,
    })
    .single();

  if (error) return res.status(401).json({ error: error.message });
  return res.status(200).json({ message: 'success' });
};

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  try {
    switch (req.method) {
      case 'GET':
        return await fetchOrgs(req, res);

      case 'POST':
        return await createOrg(req, res);

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
