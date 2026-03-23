'use client';

import { useQueryClient } from '@tanstack/react-query';
import {
  addWorkspaceTaskLabel,
  deleteWorkspaceTask,
  listWorkspaceTaskLists,
  removeWorkspaceTaskLabel,
  updateWorkspaceTask,
} from '@tuturuuu/internal-api';
import type { TaskWithRelations } from '@tuturuuu/types';
import type { TaskPriority } from '@tuturuuu/types/primitives/Priority';
import { toast } from '@tuturuuu/ui/sonner';
import { useTranslations } from 'next-intl';
import { useCallback, useState } from 'react';
import {
  MY_COMPLETED_TASKS_QUERY_KEY,
  MY_TASKS_QUERY_KEY,
  type MyTasksData,
} from './use-my-tasks-query';

interface UseTaskContextActionsOptions {
  task: TaskWithRelations;
  userId: string;
  onTaskUpdate: () => void;
  onClose: () => void;
}

export function useTaskContextActions({
  task,
  userId,
  onTaskUpdate,
  onClose,
}: UseTaskContextActionsOptions) {
  const t = useTranslations('ws-tasks');
  const queryClient = useQueryClient();
  const [isLoading, setIsLoading] = useState(false);
  const taskWorkspaceId = task.list?.board?.ws_id ?? null;
  const taskBoardId = task.list?.board?.id ?? null;

  const invalidateQueries = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: [MY_TASKS_QUERY_KEY] });
    queryClient.invalidateQueries({
      queryKey: [MY_COMPLETED_TASKS_QUERY_KEY],
    });
  }, [queryClient]);

  const updateTaskInCache = useCallback(
    (updates: Partial<TaskWithRelations>) => {
      queryClient.setQueriesData<MyTasksData>(
        { queryKey: [MY_TASKS_QUERY_KEY] },
        (old) => {
          if (!old) return old;
          const mapper = (t: TaskWithRelations) =>
            t.id === task.id ? { ...t, ...updates } : t;
          return {
            ...old,
            overdue: old.overdue.map(mapper),
            today: old.today.map(mapper),
            upcoming: old.upcoming.map(mapper),
          };
        }
      );
    },
    [queryClient, task.id]
  );

  const handlePriorityChange = useCallback(
    async (priority: TaskPriority | null) => {
      setIsLoading(true);
      updateTaskInCache({ priority });
      try {
        if (!taskWorkspaceId) throw new Error('Task workspace not found');
        await updateWorkspaceTask(taskWorkspaceId, task.id, { priority });
        invalidateQueries();
      } catch {
        toast.error(t('failed_to_update'));
        invalidateQueries();
      } finally {
        setIsLoading(false);
      }
    },
    [task.id, taskWorkspaceId, updateTaskInCache, invalidateQueries, t]
  );

  const handleDueDateChange = useCallback(
    async (days: number | null) => {
      setIsLoading(true);
      const newDate =
        days !== null
          ? new Date(Date.now() + days * 86400000).toISOString()
          : null;
      updateTaskInCache({ end_date: newDate });
      try {
        if (!taskWorkspaceId) throw new Error('Task workspace not found');
        await updateWorkspaceTask(taskWorkspaceId, task.id, {
          end_date: newDate,
        });
        invalidateQueries();
      } catch {
        toast.error(t('failed_to_update'));
        invalidateQueries();
      } finally {
        setIsLoading(false);
      }
    },
    [task.id, taskWorkspaceId, updateTaskInCache, invalidateQueries, t]
  );

  const handleToggleLabel = useCallback(
    async (labelId: string) => {
      setIsLoading(true);
      const hasLabel = task.labels?.some((l) => l.label?.id === labelId);
      try {
        if (!taskWorkspaceId) throw new Error('Task workspace not found');
        if (hasLabel) {
          await removeWorkspaceTaskLabel(taskWorkspaceId, task.id, labelId);
        } else {
          await addWorkspaceTaskLabel(taskWorkspaceId, task.id, labelId);
        }
        invalidateQueries();
      } catch {
        toast.error(t('failed_to_update'));
        invalidateQueries();
      } finally {
        setIsLoading(false);
      }
    },
    [task.id, task.labels, taskWorkspaceId, invalidateQueries, t]
  );

  const handleComplete = useCallback(async () => {
    if (!taskBoardId || !taskWorkspaceId) return;
    setIsLoading(true);
    try {
      const { lists } = await listWorkspaceTaskLists(
        taskWorkspaceId,
        taskBoardId
      );

      const doneList = lists?.find((l) => l.status === 'done');
      if (!doneList) {
        toast.error('No done list found');
        return;
      }

      await updateWorkspaceTask(taskWorkspaceId, task.id, {
        list_id: doneList.id,
      });

      // Clear redundant personal overrides when task is actually done
      if (
        task.overrides?.completed_at ||
        task.overrides?.personally_unassigned
      ) {
        await fetch(`/api/v1/users/me/tasks/${task.id}/overrides`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            completed_at: null,
            personally_unassigned: false,
          }),
        }).catch(() => {
          // Non-critical cleanup
        });
      }

      onTaskUpdate();
      onClose();
    } catch {
      toast.error(t('failed_to_update'));
    } finally {
      setIsLoading(false);
    }
  }, [
    task.id,
    taskBoardId,
    taskWorkspaceId,
    task.overrides,
    onTaskUpdate,
    onClose,
    t,
  ]);

  const handleDoneWithMyPart = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await fetch(
        `/api/v1/users/me/tasks/${task.id}/overrides`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ personally_unassigned: true }),
        }
      );
      if (!response.ok) throw new Error('Failed');
      onTaskUpdate();
      onClose();
    } catch {
      toast.error(t('failed_to_update'));
    } finally {
      setIsLoading(false);
    }
  }, [task.id, onTaskUpdate, onClose, t]);

  const handleUndoDoneWithMyPart = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await fetch(
        `/api/v1/users/me/tasks/${task.id}/overrides`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            personally_unassigned: false,
            completed_at: null,
          }),
        }
      );
      if (!response.ok) throw new Error('Failed');
      onTaskUpdate();
      onClose();
    } catch {
      toast.error(t('failed_to_update'));
    } finally {
      setIsLoading(false);
    }
  }, [task.id, onTaskUpdate, onClose, t]);

  const handleUndoComplete = useCallback(async () => {
    if (!taskBoardId || !taskWorkspaceId) return;
    setIsLoading(true);
    try {
      const { lists } = await listWorkspaceTaskLists(
        taskWorkspaceId,
        taskBoardId
      );

      const activeList =
        lists?.find((l) => l.status === 'active') ??
        lists?.find((l) => l.status === 'not_started');
      if (!activeList) {
        toast.error('No active list found');
        return;
      }

      await updateWorkspaceTask(taskWorkspaceId, task.id, {
        list_id: activeList.id,
      });

      onTaskUpdate();
      onClose();
    } catch {
      toast.error(t('failed_to_update'));
    } finally {
      setIsLoading(false);
    }
  }, [task.id, taskBoardId, taskWorkspaceId, onTaskUpdate, onClose, t]);

  const handleUnassignMe = useCallback(async () => {
    setIsLoading(true);
    // Optimistic: remove task from My Tasks cache
    queryClient.setQueriesData<MyTasksData>(
      { queryKey: [MY_TASKS_QUERY_KEY] },
      (old) => {
        if (!old) return old;
        const filterOut = (t: TaskWithRelations) => t.id !== task.id;
        return {
          ...old,
          overdue: old.overdue.filter(filterOut),
          today: old.today.filter(filterOut),
          upcoming: old.upcoming.filter(filterOut),
          totalActiveTasks: old.totalActiveTasks - 1,
        };
      }
    );
    try {
      if (!taskWorkspaceId) throw new Error('Task workspace not found');
      await updateWorkspaceTask(taskWorkspaceId, task.id, {
        assignee_ids: (task.assignees ?? [])
          .map((assignee) => assignee.user?.id)
          .filter((assigneeId): assigneeId is string =>
            Boolean(assigneeId && assigneeId !== userId)
          ),
      });
      onTaskUpdate();
      onClose();
    } catch {
      toast.error(t('failed_to_update'));
      invalidateQueries();
    } finally {
      setIsLoading(false);
    }
  }, [
    task.id,
    taskWorkspaceId,
    userId,
    queryClient,
    onTaskUpdate,
    onClose,
    invalidateQueries,
    t,
    task.assignees,
  ]);

  const handleDelete = useCallback(async () => {
    setIsLoading(true);
    try {
      if (!taskWorkspaceId) throw new Error('Task workspace not found');
      await deleteWorkspaceTask(taskWorkspaceId, task.id);
      onTaskUpdate();
      onClose();
    } catch {
      toast.error(t('failed_to_update'));
    } finally {
      setIsLoading(false);
    }
  }, [task.id, taskWorkspaceId, onTaskUpdate, onClose, t]);

  return {
    isLoading,
    handlePriorityChange,
    handleDueDateChange,
    handleToggleLabel,
    handleComplete,
    handleUndoComplete,
    handleDoneWithMyPart,
    handleUndoDoneWithMyPart,
    handleUnassignMe,
    handleDelete,
  };
}
