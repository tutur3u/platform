import { createServerSupabaseClient } from '@supabase/auth-helpers-nextjs';
import type { NextApiRequest, NextApiResponse } from 'next';

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  try {
    switch (req.method) {
      case 'GET':
        return await fetchTasks(req, res);

      case 'POST':
        return await createTask(req, res);

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

const fetchTasks = async (req: NextApiRequest, res: NextApiResponse) => {
  const supabase = createServerSupabaseClient({
    req,
    res,
  });

  const { listId, todos, completed } = req.query;
  if (!listId) return res.status(401).json({ error: 'Invalid list ID' });

  const query = supabase
    .from('tasks')
    .select('id, name, description, completed, start_date, end_date')
    .eq('list_id', listId)
    .order('created_at');

  if (todos === 'true') query.eq('completed', false);
  if (completed === 'true') query.eq('completed', true);

  const { data, error } = await query;

  if (error) return res.status(401).json({ error: error.message });
  return res.status(200).json(data);
};

const createTask = async (req: NextApiRequest, res: NextApiResponse) => {
  const supabase = createServerSupabaseClient({
    req,
    res,
  });

  const { name, description, startDate, endDate, listId } = req.body;

  const { error } = await supabase
    .from('tasks')
    .insert({
      name,
      description,
      start_date: startDate,
      end_date: endDate,
      list_id: listId,
    })
    .single();

  if (error) return res.status(401).json({ error: error.message });
  return res.status(200).json({});
};
