'use server';

import type { ExtendedWorkspaceTask } from '../../time-tracker/types';
import { createClient } from '@tuturuuu/supabase/next/server';

export async function getAssignedTasks(
  assigneeId: string
): Promise<ExtendedWorkspaceTask[]> {
  const supabase = await createClient();

  const { data: assignedTasks, error } = await supabase
    .from('task_assignees')
    .select('...tasks(*)')
    .eq('user_id', assigneeId);

  if (error) {
    console.error('Error fetching tasks:', error);
    return [];
  }

  return assignedTasks;
}
