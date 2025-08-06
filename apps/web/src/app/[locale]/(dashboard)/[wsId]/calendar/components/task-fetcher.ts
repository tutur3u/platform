'use server';

import type { ExtendedWorkspaceTask } from '../../time-tracker/types';
import { createClient } from '@tuturuuu/supabase/next/server';

export async function getAssignedTasks(
  assigneeId: string,
  searchQuery?: string
): Promise<ExtendedWorkspaceTask[]> {
  const supabase = await createClient();

  let query = supabase
    .from('task_assignees')
    .select('...tasks!inner(*)')
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

  console.log('assignedTasks', assignedTasks);

  return assignedTasks;
}
