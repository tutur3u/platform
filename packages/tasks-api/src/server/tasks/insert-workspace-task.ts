import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import type { Database } from '@tuturuuu/types';
import { taskFleetClient, withTaskFleetColumns } from './task-fleet-fields';

export function insertWorkspaceTask(
  sbAdmin: TypedSupabaseClient,
  taskInsert: Database['public']['Tables']['tasks']['Insert'],
  includeFleetFields: boolean
) {
  return taskFleetClient(sbAdmin)
    .from('tasks')
    .insert(taskInsert)
    .select(
      withTaskFleetColumns(
        `
        id,
        display_number,
        name,
        description,
        priority,
        completed,
        start_date,
        end_date,
        estimation_points,
        sort_key,
        created_at,
        list_id,
          task_lists!inner(
            id,
            name,
            workspace_boards!inner(
              name,
              ticket_prefix
            )
          )
        `,
        includeFleetFields
      )
    )
    .maybeSingle();
}
