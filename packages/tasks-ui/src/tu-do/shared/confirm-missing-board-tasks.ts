import { InternalApiError } from '@tuturuuu/internal-api';
import { getWorkspaceTask } from '@tuturuuu/internal-api/tasks';
import type { Task } from '@tuturuuu/types/primitives/Task';

export const MISSING_TASK_CHECK_LIMIT = 10;

/** A partial page cannot prove deletion: check missing records by ID instead. */
export async function confirmMissingBoardTasks(
  wsId: string,
  listId: string,
  tasks: Task[],
  offset = 0
) {
  const absent = new Set<string>();
  // Personal external cards represent placements, not source-list membership.
  const eligible = tasks.filter((task) => !task.is_personal_external);
  // Bound work on each refresh and rotate through the remaining records later.
  // Anything not checked stays in the cache.
  const candidates = Array.from(
    { length: Math.min(MISSING_TASK_CHECK_LIMIT, eligible.length) },
    (_, index) => eligible[(offset + index) % eligible.length]!
  );
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(2, candidates.length) }, async () => {
      for (;;) {
        const task = candidates[next++];
        if (!task) return;
        try {
          const result = await getWorkspaceTask(wsId, task.id);
          if (
            result.task &&
            (result.task.deleted_at || result.task.list_id !== listId)
          )
            absent.add(task.id);
        } catch (error) {
          if (error instanceof InternalApiError && error.status === 404)
            absent.add(task.id);
          // Network/server errors are not evidence that a saved task is gone.
        }
      }
    })
  );
  return absent;
}
