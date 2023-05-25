import { createPagesServerClient } from '@supabase/auth-helpers-nextjs';
import type { NextApiRequest, NextApiResponse } from 'next';

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  try {
    const { taskId, assigneeId } = req.query;

    if (!taskId || typeof taskId !== 'string')
      throw new Error('Invalid Task ID');

    if (!assigneeId || typeof assigneeId !== 'string')
      throw new Error('Invalid Assignee ID');

    switch (req.method) {
      case 'DELETE':
        return await removeAssignee(req, res, taskId, assigneeId);

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

const removeAssignee = async (
  req: NextApiRequest,
  res: NextApiResponse,
  taskId: string,
  assigneeId: string
) => {
  const supabase = createPagesServerClient({
    req,
    res,
  });

  const { error } = await supabase
    .from('task_assignees')
    .delete()
    .eq('task_id', taskId)
    .eq('user_id', assigneeId);

  if (error) return res.status(401).json({ error: error.message });
  return res.status(200).json({});
};
