'use client';

import { toast } from '@tuturuuu/ui/sonner';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo, useState } from 'react';
import type { ProjectUpdate } from '../types';

interface UseProjectUpdatesOptions {
  wsId: string;
  projectId: string;
}

export function useProjectUpdates({
  wsId,
  projectId,
}: UseProjectUpdatesOptions) {
  const queryClient = useQueryClient();
  const [newUpdateContent, setNewUpdateContent] = useState('');
  const [editingUpdateId, setEditingUpdateId] = useState<string | null>(null);
  const [editingUpdateContent, setEditingUpdateContent] = useState('');

  // Query for fetching updates
  const {
    data: updates = [],
    isLoading: isLoadingUpdates,
    refetch: fetchUpdates,
  } = useQuery({
    queryKey: ['project-updates', wsId, projectId],
    queryFn: async () => {
      const response = await fetch(
        `/api/v1/workspaces/${wsId}/task-projects/${projectId}/updates`
      );
      if (!response.ok) {
        throw new Error('Failed to fetch updates');
      }
      const data = await response.json();
      return (data.updates || []) as ProjectUpdate[];
    },
    staleTime: 30000, // 30 seconds
  });

  // Recent updates for overview (limit to 3)
  const recentUpdates = useMemo(() => updates.slice(0, 3), [updates]);

  // Mutation for posting new update
  const postUpdateMutation = useMutation({
    mutationFn: async (content: string) => {
      const response = await fetch(
        `/api/v1/workspaces/${wsId}/task-projects/${projectId}/updates`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to post update');
      }

      return response.json();
    },
    onSuccess: (newUpdate) => {
      queryClient.setQueryData<ProjectUpdate[]>(
        ['project-updates', wsId, projectId],
        (old = []) => [newUpdate, ...old]
      );
      setNewUpdateContent('');
      toast.success('Update posted successfully');
    },
    onError: (error) => {
      console.error('Error posting update:', error);
      toast.error(
        error instanceof Error ? error.message : 'Failed to post update'
      );
    },
  });

  // Mutation for deleting update
  const deleteUpdateMutation = useMutation({
    mutationFn: async (updateId: string) => {
      const response = await fetch(
        `/api/v1/workspaces/${wsId}/task-projects/${projectId}/updates/${updateId}`,
        { method: 'DELETE' }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to delete update');
      }

      return updateId;
    },
    onSuccess: (updateId) => {
      queryClient.setQueryData<ProjectUpdate[]>(
        ['project-updates', wsId, projectId],
        (old = []) => old.filter((u) => u.id !== updateId)
      );
      toast.success('Update deleted successfully');
    },
    onError: (error) => {
      console.error('Error deleting update:', error);
      toast.error(
        error instanceof Error ? error.message : 'Failed to delete update'
      );
    },
  });

  // Mutation for editing update
  const editUpdateMutation = useMutation({
    mutationFn: async ({
      updateId,
      content,
    }: {
      updateId: string;
      content: string;
    }) => {
      const response = await fetch(
        `/api/v1/workspaces/${wsId}/task-projects/${projectId}/updates/${updateId}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to update');
      }

      return response.json();
    },
    onSuccess: (updatedUpdate, { updateId }) => {
      queryClient.setQueryData<ProjectUpdate[]>(
        ['project-updates', wsId, projectId],
        (old = []) =>
          old.map((u) => (u.id === updateId ? { ...u, ...updatedUpdate } : u))
      );
      setEditingUpdateId(null);
      setEditingUpdateContent('');
      toast.success('Update saved successfully');
    },
    onError: (error) => {
      console.error('Error saving update:', error);
      toast.error(
        error instanceof Error ? error.message : 'Failed to save update'
      );
    },
  });

  const postUpdate = useCallback(() => {
    if (!newUpdateContent.trim()) {
      toast.error('Update content cannot be empty');
      return;
    }
    postUpdateMutation.mutate(newUpdateContent);
  }, [newUpdateContent, postUpdateMutation]);

  const deleteUpdate = useCallback(
    (updateId: string) => {
      deleteUpdateMutation.mutate(updateId);
    },
    [deleteUpdateMutation]
  );

  const startEditingUpdate = useCallback((update: ProjectUpdate) => {
    setEditingUpdateId(update.id);
    setEditingUpdateContent(update.content);
  }, []);

  const cancelEditingUpdate = useCallback(() => {
    setEditingUpdateId(null);
    setEditingUpdateContent('');
  }, []);

  const saveEditedUpdate = useCallback(
    (updateId: string) => {
      if (!editingUpdateContent.trim()) {
        toast.error('Update content cannot be empty');
        return;
      }
      editUpdateMutation.mutate({ updateId, content: editingUpdateContent });
    },
    [editingUpdateContent, editUpdateMutation]
  );

  return {
    updates,
    recentUpdates,
    isLoadingUpdates,
    newUpdateContent,
    setNewUpdateContent,
    isPostingUpdate: postUpdateMutation.isPending,
    editingUpdateId,
    editingUpdateContent,
    setEditingUpdateContent,
    isDeletingUpdateId: deleteUpdateMutation.isPending
      ? deleteUpdateMutation.variables
      : null,
    fetchUpdates,
    postUpdate,
    deleteUpdate,
    startEditingUpdate,
    cancelEditingUpdate,
    saveEditedUpdate,
  };
}
