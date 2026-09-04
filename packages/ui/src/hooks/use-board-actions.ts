import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from '@tuturuuu/ui/sonner';
import { getTaskApiUrl } from '../lib/tasks-app-url';

export async function getBoardActionError(
  response: Response,
  fallback: string
) {
  const errorData = (await response.json().catch(() => null)) as {
    error?: unknown;
    message?: unknown;
  } | null;

  if (typeof errorData?.error === 'string') return errorData.error;
  if (typeof errorData?.message === 'string') return errorData.message;
  return fallback;
}

async function boardAction(
  wsId: string,
  boardId: string,
  method: 'PUT' | 'DELETE' | 'PATCH',
  body?: any
) {
  const response = await fetch(
    getTaskApiUrl(`/api/v1/workspaces/${wsId}/boards/${boardId}`),
    {
      method,
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    }
  );

  if (!response.ok) {
    throw new Error(await getBoardActionError(response, 'Board action failed'));
  }

  return response.json();
}

async function archiveAction(
  wsId: string,
  boardId: string,
  method: 'POST' | 'DELETE'
) {
  const response = await fetch(
    getTaskApiUrl(`/api/v1/workspaces/${wsId}/boards/${boardId}/archive`),
    {
      method,
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
    }
  );

  if (!response.ok) {
    throw new Error(
      await getBoardActionError(response, 'Archive action failed')
    );
  }

  return response.json();
}

interface BoardActionOptions {
  onSuccess?: () => void;
}

export function useBoardActions(wsId: string) {
  const queryClient = useQueryClient();

  const invalidateBoardQueries = (boardId: string) => {
    void queryClient.invalidateQueries({ queryKey: ['boards', wsId] });
    void queryClient.invalidateQueries({
      queryKey: ['accessible-task-boards'],
    });
    void queryClient.invalidateQueries({
      queryKey: ['task-board', wsId, boardId],
    });
    void queryClient.invalidateQueries({
      queryKey: ['task-board-settings', wsId, boardId],
    });
  };

  const softDeleteMutation = useMutation<
    any,
    Error,
    { boardId: string; options?: BoardActionOptions }
  >({
    mutationFn: ({ boardId }) => boardAction(wsId, boardId, 'PUT'),
    onSuccess: (_, { boardId, options }) => {
      toast.success('Board moved to trash successfully');
      invalidateBoardQueries(boardId);
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
    onSuccess: (_, { boardId, options }) => {
      toast.success('Board permanently deleted successfully');
      invalidateBoardQueries(boardId);
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
    onSuccess: (_, { boardId, options }) => {
      toast.success('Board restored successfully');
      invalidateBoardQueries(boardId);
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
    onSuccess: (_, { boardId, options }) => {
      toast.success('Board archived successfully');
      invalidateBoardQueries(boardId);
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
    onSuccess: (_, { boardId, options }) => {
      toast.success('Board unarchived successfully');
      invalidateBoardQueries(boardId);
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
      fetch(
        getTaskApiUrl(`/api/v1/workspaces/${wsId}/task-boards/${boardId}/copy`),
        {
          method: 'POST',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            targetWorkspaceId: wsId,
          }),
        }
      ).then(async (res) => {
        if (!res.ok) {
          const errorData = await res.json();
          throw new Error(errorData.error || 'Failed to duplicate board');
        }
        return res.json();
      }),
    onSuccess: (_, { boardId, options }) => {
      toast.success('Board duplicated successfully');
      invalidateBoardQueries(boardId);
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
    isArchiving: archiveMutation.isPending,
    isDeleting: softDeleteMutation.isPending,
    isPermanentlyDeleting: permanentDeleteMutation.isPending,
    isRestoring: restoreMutation.isPending,
    isUnarchiving: unarchiveMutation.isPending,
  };
}
