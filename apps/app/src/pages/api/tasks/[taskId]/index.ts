import { createServerSupabaseClient } from '@supabase/auth-helpers-nextjs';
import type { NextApiRequest, NextApiResponse } from 'next';

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  try {
    const { taskId } = req.query;
    if (!taskId || typeof taskId !== 'string') throw new Error('Invalid ID');

    switch (req.method) {
      case 'PUT':
        return await updateTask(req, res, taskId);

      case 'DELETE':
        return await deleteTask(req, res, taskId);

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

const updateTask = async (
  req: NextApiRequest,
  res: NextApiResponse,
  taskId: string
) => {
  const supabase = createServerSupabaseClient({
    req,
    res,
  });

  const { name, description, priority, completed, startDate, endDate, listId } =
    req.body;

  const { error } = await supabase
    .from('tasks')
    .update({
      name,
      description,
      completed,
      priority,
      start_date: startDate,
      end_date: endDate,
      list_id: listId,
    })
    .eq('id', taskId);

  if (error) return res.status(401).json({ error: error.message });
  return res.status(200).json({});
};

const deleteTask = async (
  req: NextApiRequest,
  res: NextApiResponse,
  taskId: string
) => {
  const supabase = createServerSupabaseClient({
    req,
    res,
  });

  const { error } = await supabase.from('tasks').delete().eq('id', taskId);

  if (error) return res.status(401).json({ error: error.message });
  return res.status(200).json({});
};
