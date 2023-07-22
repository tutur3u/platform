import { createPagesServerClient } from '@supabase/auth-helpers-nextjs';
import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '../../../utils/supabase/client';

const fetchUser = async (req: NextApiRequest, res: NextApiResponse) => {
  const supabase = createPagesServerClient({
    req,
    res,
  });

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (!user?.id || userError)
    return res.status(401).json({ error: 'Unauthorized.' });

  const publicPromise = supabase
    .from('users')
    .select('id, display_name, handle, created_at, avatar_url')
    .eq('id', user?.id)
    .single();

  const privatePromise = supabase
    .from('user_private_details')
    .select('email, new_email, birthday')
    .eq('user_id', user?.id)
    .single();

  const [{ data, error }, { data: privateData, error: privateError }] =
    await Promise.all([publicPromise, privatePromise]);

  if (error) return res.status(401).json({ error: error.message });

  if (privateError)
    return res.status(401).json({ error: privateError.message });

  return res.status(200).json({ ...data, ...privateData });
};

const updateUser = async (req: NextApiRequest, res: NextApiResponse) => {
  const supabase = createPagesServerClient({
    req,
    res,
  });

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (!user?.id || userError)
    return res.status(401).json({ error: 'Unauthorized.' });

  const { display_name, handle, birthday, avatar_url } = req.body;
  const sanitizedHandle = handle?.replace(/[^a-z0-9_-]/gi, '')?.toLowerCase();

  const { error } = await supabase
    .from('users')
    .update({ display_name, avatar_url, handle: sanitizedHandle })
    .eq('id', user.id);

  if (error) return res.status(401).json({ error: error.message });

  const { error: privateError } = await supabase
    .from('user_private_details')
    .update({ birthday })
    .eq('user_id', user.id);

  if (privateError)
    return res.status(401).json({ error: privateError.message });

  return res.status(200).json({});
};

const deleteUser = async (req: NextApiRequest, res: NextApiResponse) => {
  const supabase = createPagesServerClient({
    req,
    res,
  });

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (!user?.id || userError)
    return res.status(401).json({ error: 'Unauthorized.' });

  const adminClient = supabaseAdmin();

  if (!adminClient) return res.status(401).json({ error: 'Unauthorized.' });

  const { error } = await adminClient.auth.admin.deleteUser(user.id);

  if (error) return res.status(401).json({ error: error.message });

  return res.status(200).json({});
};

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  try {
    switch (req.method) {
      case 'GET':
        return await fetchUser(req, res);

      case 'PUT':
        return await updateUser(req, res);

      case 'DELETE':
        return await deleteUser(req, res);

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
