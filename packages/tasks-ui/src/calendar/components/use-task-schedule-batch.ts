import { useQuery } from '@tanstack/react-query';
import { getTaskScheduleBatch } from '@tuturuuu/internal-api/tasks-scheduling';
import { useWorkspaceActor } from '@tuturuuu/ui/hooks/use-workspace-visibility';
import { visibleTaskScheduleSnapshot } from './task-schedule-snapshot';

/** A hung schedule read must not hold every card in a pending state. */
const SCHEDULE_BATCH_TIMEOUT_MS = 15_000;

/**
 * Per-user schedule settings and scheduled minutes for the open tasks, read
 * as one batched query. `isLoading` is true only before the first snapshot;
 * a failed or refetching batch falls back to the task's own fields.
 */
export function useTaskScheduleBatch({
  wsId,
  taskIds,
  isPersonalWorkspace,
}: {
  wsId: string;
  taskIds: string[];
  isPersonalWorkspace: boolean;
}) {
  const actor = useWorkspaceActor();
  const sortedIds = [...new Set(taskIds)].sort();
  const enabled = !!actor && sortedIds.length > 0;
  const { data, error, fetchStatus, isPending } = useQuery({
    queryKey: [
      'task-schedule-batch',
      actor?.actorId,
      wsId,
      sortedIds.join(','),
      isPersonalWorkspace ? 'personal' : 'workspace',
    ],
    queryFn: async ({ signal }) => {
      actor?.assertActive();
      const result = await getTaskScheduleBatch(
        wsId,
        sortedIds,
        isPersonalWorkspace,
        AbortSignal.any([
          signal,
          AbortSignal.timeout(SCHEDULE_BATCH_TIMEOUT_MS),
        ])
      );
      actor?.assertActive();
      return result;
    },
    staleTime: 30_000,
    refetchOnWindowFocus: true,
    retry: 1,
    // Keep the same actor's last snapshot while a changed task set refetches,
    // so cards do not flash back to pending. Another actor never sees it.
    placeholderData: (previous, previousQuery) =>
      previousQuery?.queryKey[1] === actor?.actorId &&
      previousQuery?.queryKey[2] === wsId
        ? previous
        : undefined,
    enabled,
  });

  const snapshot = visibleTaskScheduleSnapshot(data, error);
  return {
    // A paused (offline) query has not started, so it is not loading.
    isLoading: enabled && isPending && fetchStatus === 'fetching' && !error,
    minutesByTaskId: snapshot?.minutesByTaskId ?? {},
    settingsByTaskId: snapshot?.settingsByTaskId ?? {},
  };
}
