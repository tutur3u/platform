'use client';

import { toast } from '@tuturuuu/ui/sonner';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ProjectUpdate } from '../types';

interface UseProjectUpdatesOptions {
  wsId: string;
  projectId: string;
}

export function useProjectUpdates({
  wsId,
  projectId,
}: UseProjectUpdatesOptions) {
  const [updates, setUpdates] = useState<ProjectUpdate[]>([]);
  const [isLoadingUpdates, setIsLoadingUpdates] = useState(false);
  const [newUpdateContent, setNewUpdateContent] = useState('');
  const [isPostingUpdate, setIsPostingUpdate] = useState(false);
  const [editingUpdateId, setEditingUpdateId] = useState<string | null>(null);
  const [editingUpdateContent, setEditingUpdateContent] = useState('');
  const [isDeletingUpdateId, setIsDeletingUpdateId] = useState<string | null>(
    null
  );

  // Recent updates for overview (limit to 3)
  const recentUpdates = useMemo(() => updates.slice(0, 3), [updates]);

  const fetchUpdates = useCallback(async () => {
    setIsLoadingUpdates(true);
    try {
      const response = await fetch(
        `/api/v1/workspaces/${wsId}/task-projects/${projectId}/updates`
      );
      if (response.ok) {
        const data = await response.json();
        setUpdates(data.updates || []);
      }
    } catch (error) {
      console.error('Error fetching updates:', error);
    } finally {
      setIsLoadingUpdates(false);
    }
  }, [wsId, projectId]);

  const postUpdate = useCallback(async () => {
    if (!newUpdateContent.trim()) {
      toast.error('Update content cannot be empty');
      return;
    }

    setIsPostingUpdate(true);
    try {
      const response = await fetch(
        `/api/v1/workspaces/${wsId}/task-projects/${projectId}/updates`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: newUpdateContent }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to post update');
      }

      const newUpdate = await response.json();
      setUpdates((prev) => [newUpdate, ...prev]);
      setNewUpdateContent('');
      toast.success('Update posted successfully');
    } catch (error) {
      console.error('Error posting update:', error);
      toast.error(
        error instanceof Error ? error.message : 'Failed to post update'
      );
    } finally {
      setIsPostingUpdate(false);
    }
  }, [wsId, projectId, newUpdateContent]);

  const deleteUpdate = useCallback(
    async (updateId: string) => {
      setIsDeletingUpdateId(updateId);
      try {
        const response = await fetch(
          `/api/v1/workspaces/${wsId}/task-projects/${projectId}/updates/${updateId}`,
          { method: 'DELETE' }
        );

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error || 'Failed to delete update');
        }

        setUpdates((prev) => prev.filter((u) => u.id !== updateId));
        toast.success('Update deleted successfully');
      } catch (error) {
        console.error('Error deleting update:', error);
        toast.error(
          error instanceof Error ? error.message : 'Failed to delete update'
        );
      } finally {
        setIsDeletingUpdateId(null);
      }
    },
    [wsId, projectId]
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
    async (updateId: string) => {
      if (!editingUpdateContent.trim()) {
        toast.error('Update content cannot be empty');
        return;
      }

      try {
        const response = await fetch(
          `/api/v1/workspaces/${wsId}/task-projects/${projectId}/updates/${updateId}`,
          {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content: editingUpdateContent }),
          }
        );

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error || 'Failed to update');
        }

        const updatedUpdate = await response.json();
        setUpdates((prev) =>
          prev.map((u) => (u.id === updateId ? { ...u, ...updatedUpdate } : u))
        );
        setEditingUpdateId(null);
        setEditingUpdateContent('');
        toast.success('Update saved successfully');
      } catch (error) {
        console.error('Error saving update:', error);
        toast.error(
          error instanceof Error ? error.message : 'Failed to save update'
        );
      }
    },
    [wsId, projectId, editingUpdateContent]
  );

  // Load updates on mount
  useEffect(() => {
    if (updates.length === 0) fetchUpdates();
  }, [fetchUpdates, updates.length]);

  return {
    updates,
    recentUpdates,
    isLoadingUpdates,
    newUpdateContent,
    setNewUpdateContent,
    isPostingUpdate,
    editingUpdateId,
    editingUpdateContent,
    setEditingUpdateContent,
    isDeletingUpdateId,
    fetchUpdates,
    postUpdate,
    deleteUpdate,
    startEditingUpdate,
    cancelEditingUpdate,
    saveEditedUpdate,
  };
}
