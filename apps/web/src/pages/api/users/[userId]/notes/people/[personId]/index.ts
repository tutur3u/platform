import { createPagesServerClient } from '@supabase/auth-helpers-nextjs';
import type { NextApiRequest, NextApiResponse } from 'next';

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  try {
    const { personId } = req.query;

    if (!personId || typeof personId !== 'string')
      return res.status(401).json({ error: 'Invalid user ID or person ID' });

    switch (req.method) {
      case 'GET':
        return await fetchNote(req, res, personId);

      case 'POST':
        return await editNote(req, res, personId);

      case 'DELETE':
        return await deleteNote(req, res, personId);

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

const fetchNote = async (
  req: NextApiRequest,
  res: NextApiResponse,
  personId: string
) => {
  const supabase = createPagesServerClient({
    req,
    res,
  });

  const { data, error } = await supabase
    .from('personal_notes')
    .select('content')
    .eq('user_id', personId)
    .maybeSingle();

  if (error) return res.status(401).json({ error: error.message });
  return res.status(200).json(data || { content: '' });
};

const editNote = async (
  req: NextApiRequest,
  res: NextApiResponse,
  personId: string
) => {
  const supabase = createPagesServerClient({
    req,
    res,
  });

  const { content } = req.body;

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return res.status(401).json({ error: 'Not authenticated' });

  const { error } = await supabase
    .from('personal_notes')
    .upsert({ user_id: personId, owner_id: user.id, content })
    .eq('user_id', personId);

  if (error) return res.status(401).json({ error: error.message });
  return res.status(200).json({
    message: 'Note updated',
  });
};

const deleteNote = async (
  req: NextApiRequest,
  res: NextApiResponse,
  personId: string
) => {
  const supabase = createPagesServerClient({
    req,
    res,
  });

  const { error } = await supabase
    .from('personal_notes')
    .delete()
    .eq('user_id', personId);

  if (error) return res.status(401).json({ error: error.message });
  return res.status(200).json({
    message: 'Note deleted',
  });
};
