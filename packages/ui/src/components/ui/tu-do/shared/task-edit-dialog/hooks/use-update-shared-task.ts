import { useMutation } from '@tanstack/react-query';

export function useUpdateSharedTask() {
  return useMutation({
    mutationFn: async ({
      shareCode,
      updates,
    }: {
      shareCode: string;
      updates: Record<string, any>;
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
