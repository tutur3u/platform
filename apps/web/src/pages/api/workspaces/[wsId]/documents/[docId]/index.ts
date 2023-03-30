import { createServerSupabaseClient } from '@supabase/auth-helpers-nextjs';
import type { NextApiRequest, NextApiResponse } from 'next';

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  try {
    const { docId } = req.query;

    if (!docId || typeof docId !== 'string') throw new Error('Invalid docId');

    switch (req.method) {
      case 'GET':
        return await fetchDocument(req, res, docId);

      case 'PUT': {
        return await updateDocument(req, res, docId);
      }

      case 'DELETE': {
        return await deleteDocument(req, res, docId);
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

const fetchDocument = async (
  req: NextApiRequest,
  res: NextApiResponse,
  docId: string
) => {
  const supabase = createServerSupabaseClient({ req, res });

  const { data, error } = await supabase
    .from('workspace_documents')
    .select('id, name, content')
    .eq('id', docId)
    .single();

  if (error) return res.status(500).json({ error: error.message });
  if (!data) return res.status(404).json({ error: 'Not found' });

  return res.status(200).json(data);
};

const updateDocument = async (
  req: NextApiRequest,
  res: NextApiResponse,
  docId: string
) => {
  const supabase = createServerSupabaseClient({
    req,
    res,
  });

  const { name, content } = req.body;

  const { error } = await supabase
    .from('workspace_documents')
    .update({
      name,
      content,
    })
    .eq('id', docId);

  if (error) return res.status(401).json({ error: error.message });
  return res.status(200).json({});
};

const deleteDocument = async (
  req: NextApiRequest,
  res: NextApiResponse,
  docId: string
) => {
  const supabase = createServerSupabaseClient({
    req,
    res,
  });

  const { error } = await supabase
    .from('workspace_documents')
    .delete()
    .eq('id', docId);

  if (error) return res.status(401).json({ error: error.message });
  return res.status(200).json({});
};

export default handler;
