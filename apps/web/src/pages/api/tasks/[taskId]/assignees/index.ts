import { createPagesServerClient } from '@supabase/auth-helpers-nextjs';
import type { NextApiRequest, NextApiResponse } from 'next';

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  try {
    switch (req.method) {
      case 'GET':
        return await fetchAssignees(req, res);

      case 'POST':
        return await addAssignee(req, res);

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

const fetchAssignees = async (req: NextApiRequest, res: NextApiResponse) => {
  const supabase = createPagesServerClient({
    req,
    res,
  });

  const { taskId } = req.query;
  if (!taskId) return res.status(401).json({ error: 'Invalid task ID' });

  const { data, error } = await supabase
    .from('task_assignees')
    .select('users(id, display_name, handle)')
    .eq('task_id', taskId);

  if (error) return res.status(401).json({ error: error.message });
  return res.status(200).json(data.map((u) => u.users));
};

const addAssignee = async (req: NextApiRequest, res: NextApiResponse) => {
  const supabase = createPagesServerClient({
    req,
    res,
  });

  const { taskId } = req.query;
  const { userId } = req.body;

  const { error } = await supabase
    .from('task_assignees')
    .insert({
      task_id: taskId,
      user_id: userId,
    })
    .single();

  if (error) return res.status(401).json({ error: error.message });
  return res.status(200).json({});
};
