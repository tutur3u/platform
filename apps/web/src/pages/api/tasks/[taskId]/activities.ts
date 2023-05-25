import { createPagesServerClient } from '@supabase/auth-helpers-nextjs';
import type { NextApiRequest, NextApiResponse } from 'next';

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  try {
    switch (req.method) {
      case 'GET':
        return await fetchActivities(req, res);

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

const fetchActivities = async (req: NextApiRequest, res: NextApiResponse) => {
  const supabase = createPagesServerClient({
    req,
    res,
  });

  const { taskId } = req.query;
  if (!taskId) return res.status(401).json({ error: 'Invalid task ID' });

  const { data, error } = await supabase
    .from('tasks')
    .select('users!creator_id(id, display_name, handle), created_at')
    .eq('id', taskId)
    .single();

  if (error) return res.status(401).json({ error: error.message });
  return res.status(200).json(data);
};
