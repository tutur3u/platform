import { queryOptions } from '@tanstack/react-query';

export function taskDetailQuery(taskId: string, workspaceId?: string) {
  return queryOptions({
    queryKey: ['task-detail', taskId, workspaceId ?? null],
    queryFn: async () => {
      const { getTaskDialogHydration } =
        await import('@tuturuuu/internal-api/tasks');
      const detail = await getTaskDialogHydration(
        taskId,
        workspaceId ? { taskWsId: workspaceId } : {}
      );
      if (!detail) throw new Error('Task detail is unavailable');
      return detail;
    },
    staleTime: 15_000,
    gcTime: 60_000,
    retry: false,
  });
}
