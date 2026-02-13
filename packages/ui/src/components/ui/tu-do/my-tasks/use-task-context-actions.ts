'use client';

import { useQueryClient } from '@tanstack/react-query';
import { createClient } from '@tuturuuu/supabase/next/client';
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
        const supabase = createClient();
        const { error } = await supabase
          .from('tasks')
          .update({ priority })
          .eq('id', task.id);
        if (error) throw error;
        invalidateQueries();
      } catch {
        toast.error(t('failed_to_update'));
        invalidateQueries();
      } finally {
        setIsLoading(false);
      }
    },
    [task.id, updateTaskInCache, invalidateQueries, t]
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
        const supabase = createClient();
        const { error } = await supabase
          .from('tasks')
          .update({ end_date: newDate })
          .eq('id', task.id);
        if (error) throw error;
        invalidateQueries();
      } catch {
        toast.error(t('failed_to_update'));
        invalidateQueries();
      } finally {
        setIsLoading(false);
      }
    },
    [task.id, updateTaskInCache, invalidateQueries, t]
  );

  const handleToggleLabel = useCallback(
    async (labelId: string) => {
      setIsLoading(true);
      const hasLabel = task.labels?.some((l) => l.label?.id === labelId);
      try {
        const supabase = createClient();
        if (hasLabel) {
          const { error } = await supabase
            .from('task_labels')
            .delete()
            .eq('task_id', task.id)
            .eq('label_id', labelId);
          if (error) throw error;
        } else {
          const { error } = await supabase
            .from('task_labels')
            .insert({ task_id: task.id, label_id: labelId });
          if (error) throw error;
        }
        invalidateQueries();
      } catch {
        toast.error(t('failed_to_update'));
        invalidateQueries();
      } finally {
        setIsLoading(false);
      }
    },
    [task.id, task.labels, invalidateQueries, t]
  );

  const handleComplete = useCallback(async () => {
    if (!task.list?.board?.id) return;
    setIsLoading(true);
    try {
      const supabase = createClient();
      const { data: lists } = await supabase
        .from('task_lists')
        .select('id, status')
        .eq('board_id', task.list.board.id)
        .eq('deleted', false);

      const doneList = lists?.find((l) => l.status === 'done');
      if (!doneList) {
        toast.error('No done list found');
        return;
      }

      const { error } = await supabase
        .from('tasks')
        .update({ list_id: doneList.id })
        .eq('id', task.id);
      if (error) throw error;

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
  }, [task.id, task.list?.board?.id, task.overrides, onTaskUpdate, onClose, t]);

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
    if (!task.list?.board?.id) return;
    setIsLoading(true);
    try {
      const supabase = createClient();
      const { data: lists } = await supabase
        .from('task_lists')
        .select('id, status')
        .eq('board_id', task.list.board.id)
        .eq('deleted', false);

      const activeList =
        lists?.find((l) => l.status === 'active') ??
        lists?.find((l) => l.status === 'not_started');
      if (!activeList) {
        toast.error('No active list found');
        return;
      }

      const { error } = await supabase
        .from('tasks')
        .update({ list_id: activeList.id })
        .eq('id', task.id);
      if (error) throw error;

      onTaskUpdate();
      onClose();
    } catch {
      toast.error(t('failed_to_update'));
    } finally {
      setIsLoading(false);
    }
  }, [task.id, task.list?.board?.id, onTaskUpdate, onClose, t]);

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
      const supabase = createClient();
      const { error } = await supabase
        .from('task_assignees')
        .delete()
        .eq('task_id', task.id)
        .eq('user_id', userId);
      if (error) throw error;
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
    userId,
    queryClient,
    onTaskUpdate,
    onClose,
    invalidateQueries,
    t,
  ]);

  const handleDelete = useCallback(async () => {
    setIsLoading(true);
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from('tasks')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', task.id);
      if (error) throw error;
      onTaskUpdate();
      onClose();
    } catch {
      toast.error(t('failed_to_update'));
    } finally {
      setIsLoading(false);
    }
  }, [task.id, onTaskUpdate, onClose, t]);

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
