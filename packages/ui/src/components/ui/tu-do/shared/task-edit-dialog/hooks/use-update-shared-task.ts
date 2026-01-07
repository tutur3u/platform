import { type UseMutationResult, useMutation } from '@tanstack/react-query';
import type { Task } from '@tuturuuu/types/primitives/Task';

export interface TaskUpdatePayload {
  name?: string;
  description?: string;
  priority?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  list_id?: string;
  estimation_points?: number | null;
  label_ids?: string[];
  assignee_ids?: string[];
  project_ids?: string[];
}

export function useUpdateSharedTask(): UseMutationResult<
  Task,
  Error,
  { shareCode: string; updates: TaskUpdatePayload }
> {
  return useMutation({
    mutationFn: async ({
      shareCode,
      updates,
    }: {
      shareCode: string;
      updates: TaskUpdatePayload;
    }) => {
      const response = await fetch(`/api/v1/shared/tasks/${shareCode}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => null);
        throw new Error(error?.error || 'Failed to update task');
      }

      return response.json();
    },
    onSuccess: () => {
      // Invalidate shared task queries if needed, typically by shareCode
      // But exact keys depend on how the shared page fetches data.
      // Assuming 'shared-task' or similar. For now, general invalidation or none if the page reloads.
      // The calling code handles toast and UI updates.
    },
  });
}
