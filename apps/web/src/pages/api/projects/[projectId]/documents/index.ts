import { createServerSupabaseClient } from '@supabase/auth-helpers-nextjs';
import type { NextApiRequest, NextApiResponse } from 'next';

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  try {
    const { projectId } = req.query;

    if (!projectId || typeof projectId !== 'string')
      throw new Error('Invalid projectId');

    switch (req.method) {
      case 'GET':
        return await fetchDocuments(req, res, projectId);

      case 'POST':
        return await createDocument(req, res, projectId);

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

const fetchDocuments = async (
  req: NextApiRequest,
  res: NextApiResponse,
  projectId: string
) => {
  const supabase = createServerSupabaseClient({
    req,
    res,
  });

  const { data, error } = await supabase
    .from('project_documents')
    .select('id, name, content, created_at')
    .eq('project_id', projectId)
    .order('created_at');

  if (error) return res.status(401).json({ error: error.message });
  return res.status(200).json(data);
};

const createDocument = async (
  req: NextApiRequest,
  res: NextApiResponse,
  projectId: string
) => {
  const supabase = createServerSupabaseClient({
    req,
    res,
  });

  const { name, content } = req.body;

  const { data, error } = await supabase
    .from('project_documents')
    .insert({
      name,
      content,
      project_id: projectId,
    })
    .select('id')
    .single();

  if (error) return res.status(401).json({ error: error.message });
  return res.status(200).json({ id: data.id });
};
