'use server';

import { createClient } from '@tuturuuu/supabase/next/server';
import type { ExtendedWorkspaceTask } from '../../time-tracker/types';

export async function getAssignedTasks(
  assigneeId: string,
  searchQuery?: string
): Promise<ExtendedWorkspaceTask[]> {
  const supabase = await createClient();

  // Include workspace ID via task_lists -> workspace_boards relation
  let query = supabase
    .from('task_assignees')
    .select(
      `
      ...tasks!inner(
        *,
        task_lists!inner(
          workspace_boards!inner(
            ws_id
          )
        )
      )
    `
    )
    .eq('user_id', assigneeId);

  // Apply search filter if searchQuery is provided
  if (searchQuery && searchQuery.trim() !== '') {
    query = query.ilike('tasks.name', `%${searchQuery}%`);
  }

  const { data: assignedTasks, error } = await query;

  if (error) {
    console.error('Error fetching tasks:', error);
    return [];
  }

  // Extract ws_id from nested relation and flatten the structure
  return (assignedTasks || []).map((task: any) => {
    const wsId = task.task_lists?.workspace_boards?.ws_id;
    // Remove nested objects to keep the task clean
    const { task_lists: _task_lists, ...taskWithoutLists } = task;
    return {
      ...taskWithoutLists,
      ws_id: wsId,
    };
  });
}
