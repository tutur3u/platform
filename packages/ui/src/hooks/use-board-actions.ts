import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from '@tuturuuu/ui/sonner';

async function boardAction(
  wsId: string,
  boardId: string,
  method: 'PUT' | 'DELETE' | 'PATCH',
  body?: any
) {
  const response = await fetch(`/api/v1/workspaces/${wsId}/boards/${boardId}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.message || 'Board action failed');
  }

  return response.json();
}

async function archiveAction(
  wsId: string,
  boardId: string,
  method: 'POST' | 'DELETE'
) {
  const response = await fetch(
    `/api/v1/workspaces/${wsId}/boards/${boardId}/archive`,
    {
      method,
      headers: {
        'Content-Type': 'application/json',
      },
    }
  );

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.message || 'Archive action failed');
  }

  return response.json();
}

interface BoardActionOptions {
  onSuccess?: () => void;
}

export function useBoardActions(wsId: string) {
  const queryClient = useQueryClient();

  const softDeleteMutation = useMutation<
    any,
    Error,
    { boardId: string; options?: BoardActionOptions }
  >({
    mutationFn: ({ boardId }) => boardAction(wsId, boardId, 'PUT'),
    onSuccess: (_, { options }) => {
      toast.success('Board moved to trash successfully');
      // Invalidate all queries that start with ['boards', wsId]
      // Using exact: false (default) to match all queries with this prefix
      queryClient.invalidateQueries({
        queryKey: ['boards', wsId],
      });
      options?.onSuccess?.();
    },
    onError: (error: Error) => {
      toast.error('Failed to delete board', {
        description: error.message,
      });
    },
  });

  const permanentDeleteMutation = useMutation<
    any,
    Error,
    { boardId: string; options?: BoardActionOptions }
  >({
    mutationFn: ({ boardId }) => boardAction(wsId, boardId, 'DELETE'),
    onSuccess: (_, { options }) => {
      toast.success('Board permanently deleted successfully');
      // Invalidate all queries that start with ['boards', wsId]
      queryClient.invalidateQueries({
        queryKey: ['boards', wsId],
      });
      options?.onSuccess?.();
    },
    onError: (error: Error) => {
      toast.error('Failed to permanently delete board', {
        description: error.message,
      });
    },
  });

  const restoreMutation = useMutation<
    any,
    Error,
    { boardId: string; options?: BoardActionOptions }
  >({
    mutationFn: ({ boardId }) =>
      boardAction(wsId, boardId, 'PATCH', { restore: true }),
    onSuccess: (_, { options }) => {
      toast.success('Board restored successfully');
      // Invalidate all queries that start with ['boards', wsId]
      queryClient.invalidateQueries({
        queryKey: ['boards', wsId],
      });
      options?.onSuccess?.();
    },
    onError: (error: Error) => {
      toast.error('Failed to restore board', {
        description: error.message,
      });
    },
  });

  const archiveMutation = useMutation<
    any,
    Error,
    { boardId: string; options?: BoardActionOptions }
  >({
    mutationFn: ({ boardId }) => archiveAction(wsId, boardId, 'POST'),
    onSuccess: (_, { options }) => {
      toast.success('Board archived successfully');
      // Invalidate all queries that start with ['boards', wsId]
      queryClient.invalidateQueries({
        queryKey: ['boards', wsId],
      });
      options?.onSuccess?.();
    },
    onError: (error: Error) => {
      toast.error('Failed to archive board', {
        description: error.message,
      });
    },
  });

  const unarchiveMutation = useMutation<
    any,
    Error,
    { boardId: string; options?: BoardActionOptions }
  >({
    mutationFn: ({ boardId }) => archiveAction(wsId, boardId, 'DELETE'),
    onSuccess: (_, { options }) => {
      toast.success('Board unarchived successfully');
      // Invalidate all queries that start with ['boards', wsId]
      queryClient.invalidateQueries({
        queryKey: ['boards', wsId],
      });
      options?.onSuccess?.();
    },
    onError: (error: Error) => {
      toast.error('Failed to unarchive board', {
        description: error.message,
      });
    },
  });

  const duplicateMutation = useMutation<
    any,
    Error,
    { boardId: string; options?: BoardActionOptions }
  >({
    mutationFn: ({ boardId }) =>
      fetch(`/api/v1/workspaces/${wsId}/task-boards/${boardId}/copy`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          targetWorkspaceId: wsId,
        }),
      }).then(async (res) => {
        if (!res.ok) {
          const errorData = await res.json();
          throw new Error(errorData.error || 'Failed to duplicate board');
        }
        return res.json();
      }),
    onSuccess: (_, { options }) => {
      toast.success('Board duplicated successfully');
      // Invalidate all queries that start with ['boards', wsId]
      queryClient.invalidateQueries({
        queryKey: ['boards', wsId],
      });
      options?.onSuccess?.();
    },
    onError: (error: Error) => {
      toast.error('Failed to duplicate board', {
        description: error.message,
      });
    },
  });

  return {
    softDeleteBoard: (boardId: string, options?: BoardActionOptions) =>
      softDeleteMutation.mutate({ boardId, options }),
    permanentDeleteBoard: (boardId: string, options?: BoardActionOptions) =>
      permanentDeleteMutation.mutate({ boardId, options }),
    restoreBoard: (boardId: string, options?: BoardActionOptions) =>
      restoreMutation.mutate({ boardId, options }),
    archiveBoard: (boardId: string, options?: BoardActionOptions) =>
      archiveMutation.mutate({ boardId, options }),
    unarchiveBoard: (boardId: string, options?: BoardActionOptions) =>
      unarchiveMutation.mutate({ boardId, options }),
    duplicateBoard: (boardId: string, options?: BoardActionOptions) =>
      duplicateMutation.mutate({ boardId, options }),
  };
}
