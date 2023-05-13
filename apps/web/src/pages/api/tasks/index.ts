import { createServerSupabaseClient } from '@supabase/auth-helpers-nextjs';
import type { NextApiRequest, NextApiResponse } from 'next';
import { Database } from '../../../types/database.types';

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
  const supabase = createServerSupabaseClient<Database>({
    req,
    res,
  });

  const { boardId, listId, todos, completed, option } = req.query;
  if (!listId && !boardId)
    return res.status(401).json({ error: 'Invalid list ID or board ID' });

  if (listId) {
    const query = supabase
      .from('tasks')
      .select(
        'id, name, description, priority, completed, start_date, end_date, list_id, task_lists!inner(board_id)'
      )
      .eq('list_id', listId)
      .order('priority', { ascending: false })
      .order('end_date', { ascending: false })
      .order('created_at', { ascending: false });

    if (todos === 'true') query.eq('completed', false);
    if (completed === 'true') query.eq('completed', true);

    const { data, error } = await query;

    const resData =
      data?.map((task) => {
        const { task_lists, ...rest } = task;
        const tempList = { board_id: '', ...task_lists };
        const { board_id } = tempList;

        return {
          ...rest,
          board_id,
        };
      }) || [];

    if (error) return res.status(401).json({ error: error.message });
    return res.status(200).json(resData);
  }

  if (option === 'my-tasks') {
    const { data, error } = await supabase.rpc('get_user_tasks', {
      _board_id: boardId as string,
    });

    if (error) return res.status(401).json({ error: error.message });
    return res.status(200).json(data);
  }

  if (option === 'recently-updated') {
    const queryBuilder = supabase
      .from('tasks')
      .select(
        'id, name, description, priority, completed, start_date, end_date, list_id, ' +
          'task_lists!inner(board_id)'
      )
      .eq('task_lists.board_id', boardId)
      .order('created_at', { ascending: false });

    const { data, error } = await queryBuilder;

    if (error) return res.status(401).json({ error: error.message });
    return res.status(200).json(data);
  }
};

const createTask = async (req: NextApiRequest, res: NextApiResponse) => {
  const supabase = createServerSupabaseClient<Database>({
    req,
    res,
  });

  const { name, description, priority, startDate, endDate, listId } = req.body;

  const { error } = await supabase
    .from('tasks')
    .insert({
      name,
      description,
      priority,
      start_date: startDate,
      end_date: endDate,
      list_id: listId,
    })
    .single();

  if (error) return res.status(401).json({ error: error.message });
  return res.status(200).json({});
};
