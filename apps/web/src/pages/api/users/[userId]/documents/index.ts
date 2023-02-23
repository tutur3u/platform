import { createServerSupabaseClient } from '@supabase/auth-helpers-nextjs';
import type { NextApiRequest, NextApiResponse } from 'next';

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  try {
    const { userId, wsId } = req.query;

    if (!userId || typeof userId !== 'string')
      return res.status(401).json({ error: 'Invalid user ID' });

    if (!wsId || typeof wsId !== 'string')
      return res.status(401).json({ error: 'Invalid workspace ID' });

    switch (req.method) {
      case 'GET':
        return await fetchDocuments(req, res, wsId);

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
  wsId?: string
) => {
  const supabase = createServerSupabaseClient({
    req,
    res,
  });

  const queryBuilder = supabase
    .from('project_documents')
    .select(
      'id, name, content, project_id, projects!inner(org_id), created_at'
    );

  if (wsId) queryBuilder.eq('projects.org_id', wsId);
  const { data, error } = await queryBuilder.order('created_at');

  if (error) return res.status(401).json({ error: error.message });

  // Filter out projects.org_id
  const filteredData = data.map((doc) => {
    const { projects, ...rest } = doc;
    return rest;
  });

  return res.status(200).json(filteredData);
};
