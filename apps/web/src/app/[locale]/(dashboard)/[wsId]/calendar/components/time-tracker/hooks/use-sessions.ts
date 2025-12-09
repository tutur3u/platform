'use client';

import { toast } from '@tuturuuu/ui/sonner';
import { useCallback, useState } from 'react';
import type { SessionWithRelations } from '../../../../time-tracker/types';

interface UseSessionsProps {
  wsId: string;
  onSuccess?: () => void;
}

interface EditSessionData {
  title: string;
  description: string;
  categoryId: string;
  taskId: string;
  startTime: string;
  endTime: string;
}

interface UseSessionsReturn {
  // Delete session
  sessionToDelete: SessionWithRelations | null;
  setSessionToDelete: (session: SessionWithRelations | null) => void;
  isDeleting: boolean;
  deleteSession: () => Promise<void>;

  // Edit session
  sessionToEdit: SessionWithRelations | null;
  setSessionToEdit: (session: SessionWithRelations | null) => void;
  isEditing: boolean;
  editData: EditSessionData;
  setEditData: (data: EditSessionData) => void;
  openEditDialog: (session: SessionWithRelations) => void;
  saveEdit: () => Promise<void>;

  // Duplicate session
  duplicateSession: (session: SessionWithRelations) => {
    title: string;
    description: string;
    categoryId: string;
    taskId: string;
  };
}

export function useSessions({
  wsId,
  onSuccess,
}: UseSessionsProps): UseSessionsReturn {
  const [sessionToDelete, setSessionToDelete] =
    useState<SessionWithRelations | null>(null);
  const [sessionToEdit, setSessionToEdit] =
    useState<SessionWithRelations | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editData, setEditData] = useState<EditSessionData>({
    title: '',
    description: '',
    categoryId: '',
    taskId: '',
    startTime: '',
    endTime: '',
  });

  // API call helper
  const apiCall = useCallback(
    async (url: string, options: RequestInit = {}) => {
      const response = await fetch(url, {
        headers: {
          'Content-Type': 'application/json',
          ...options.headers,
        },
        ...options,
      });

      if (!response.ok) {
        const error = await response
          .json()
          .catch(() => ({ error: 'Unknown error' }));
        throw new Error(error.error || `HTTP ${response.status}`);
      }

      return response.json();
    },
    []
  );

  // Delete session
  const deleteSession = useCallback(async () => {
    if (!sessionToDelete) return;

    setIsDeleting(true);

    try {
      await apiCall(
        `/api/v1/workspaces/${wsId}/time-tracking/sessions/${sessionToDelete.id}`,
        {
          method: 'DELETE',
        }
      );

      setSessionToDelete(null);
      onSuccess?.();
      toast.success('Time session deleted successfully');
    } catch (error) {
      console.error('Error deleting session:', error);
      toast.error('Failed to delete session');
    } finally {
      setIsDeleting(false);
    }
  }, [sessionToDelete, wsId, apiCall, onSuccess]);

  // Open edit dialog
  const openEditDialog = useCallback((session: SessionWithRelations) => {
    setSessionToEdit(session);
    setEditData({
      title: session.title,
      description: session.description || '',
      categoryId: session.category_id || '',
      taskId: session.task_id || '',
      startTime: new Date(session.start_time).toISOString().slice(0, 16),
      endTime: session.end_time
        ? new Date(session.end_time).toISOString().slice(0, 16)
        : '',
    });
  }, []);

  // Save edit
  const saveEdit = useCallback(async () => {
    if (!sessionToEdit) return;

    setIsEditing(true);

    try {
      await apiCall(
        `/api/v1/workspaces/${wsId}/time-tracking/sessions/${sessionToEdit.id}`,
        {
          method: 'PATCH',
          body: JSON.stringify({
            action: 'edit',
            title: editData.title,
            description: editData.description,
            categoryId: editData.categoryId || null,
            taskId: editData.taskId || null,
            startTime: editData.startTime
              ? new Date(editData.startTime).toISOString()
              : undefined,
            endTime: editData.endTime
              ? new Date(editData.endTime).toISOString()
              : undefined,
          }),
        }
      );

      setSessionToEdit(null);
      onSuccess?.();
      toast.success('Session updated successfully');
    } catch (error) {
      console.error('Error updating session:', error);
      toast.error('Failed to update session');
    } finally {
      setIsEditing(false);
    }
  }, [sessionToEdit, wsId, editData, apiCall, onSuccess]);

  // Duplicate session (returns settings to pre-fill form)
  const duplicateSession = useCallback((session: SessionWithRelations) => {
    toast.success('Session settings copied');
    return {
      title: session.title,
      description: session.description || '',
      categoryId: session.category_id || '',
      taskId: session.task_id || '',
    };
  }, []);

  return {
    sessionToDelete,
    setSessionToDelete,
    isDeleting,
    deleteSession,
    sessionToEdit,
    setSessionToEdit,
    isEditing,
    editData,
    setEditData,
    openEditDialog,
    saveEdit,
    duplicateSession,
  };
}
