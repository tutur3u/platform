import { useQueryClient } from '@tanstack/react-query';
import { createClient } from '@tuturuuu/supabase/next/client';
import type { TaskPriority } from '@tuturuuu/types/primitives/Priority';
import type { CalendarHoursType } from '@tuturuuu/types/primitives/Task';
import { useToast } from '@tuturuuu/ui/hooks/use-toast';
import { invalidateTaskCaches } from '@tuturuuu/utils/task-helper';
import { useCallback, useState } from 'react';

export interface SchedulingSettings {
  totalDuration: number | null;
  isSplittable: boolean;
  minSplitDurationMinutes: number | null;
  maxSplitDurationMinutes: number | null;
  calendarHours: CalendarHoursType | null;
  autoSchedule: boolean;
}

export interface UseTaskMutationsProps {
  taskId?: string;
  isCreateMode: boolean;
  boardId: string;
  estimationPoints: number | null;
  priority: TaskPriority | null;
  selectedListId?: string;
  taskName?: string;
  setEstimationPoints: (value: number | null) => void;
  setPriority: (value: TaskPriority | null) => void;
  setStartDate: (value: Date | undefined) => void;
  setEndDate: (value: Date | undefined) => void;
  setSelectedListId: (value: string) => void;
  onUpdate: () => void;
}

export interface UseTaskMutationsReturn {
  updateEstimation: (points: number | null) => Promise<void>;
  updatePriority: (newPriority: TaskPriority | null) => Promise<void>;
  updateStartDate: (newDate: Date | undefined) => Promise<void>;
  updateEndDate: (newDate: Date | undefined) => Promise<void>;
  updateList: (newListId: string) => Promise<void>;
  saveNameToDatabase: (newName: string) => Promise<void>;
  saveSchedulingSettings: (settings: SchedulingSettings) => Promise<boolean>;
  estimationSaving: boolean;
  schedulingSaving: boolean;
}

const supabase = createClient();

/**
 * Custom hook for task database mutations (CRUD operations on task properties)
 * Extracted from task-edit-dialog.tsx to improve maintainability
 */
export function useTaskMutations({
  taskId,
  isCreateMode,
  boardId,
  estimationPoints,
  priority,
  selectedListId,
  taskName,
  setEstimationPoints,
  setPriority,
  setStartDate,
  setEndDate,
  setSelectedListId,
  onUpdate,
}: UseTaskMutationsProps): UseTaskMutationsReturn {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [estimationSaving, setEstimationSaving] = useState(false);
  const [schedulingSaving, setSchedulingSaving] = useState(false);

  // Helper to trigger refresh after successful mutations
  // Note: The kanban board uses realtime subscriptions directly and doesn't
  // register a refresh callback via the task dialog system, so calling onUpdate
  // here won't conflict with realtime sync on the board page.
  // Also invalidate task-history so the activity section updates immediately.
  const triggerRefresh = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['task-history'] });
    onUpdate();
  }, [queryClient, onUpdate]);

  const updateEstimation = useCallback(
    async (points: number | null) => {
      if (points === estimationPoints) return;
      setEstimationPoints(points);
      if (isCreateMode || !taskId || taskId === 'new') {
        return;
      }
      setEstimationSaving(true);

      // Optimistic update - prevents flicker by updating cache immediately
      queryClient.setQueryData(
        ['tasks', boardId],
        (oldTasks: any[] | undefined) => {
          if (!oldTasks) return oldTasks;
          return oldTasks.map((task) =>
            task.id === taskId ? { ...task, estimation_points: points } : task
          );
        }
      );

      try {
        const { error } = await supabase
          .from('tasks')
          .update({ estimation_points: points })
          .eq('id', taskId);
        if (error) throw error;
        // Notify parent components (e.g., server component refresh)
        // Skip in collaboration mode where realtime sync handles updates
        triggerRefresh();
      } catch (e: any) {
        console.error('Failed updating estimation', e);
        // Revert optimistic update on error
        await invalidateTaskCaches(queryClient, boardId);
        toast({
          title: 'Failed to update estimation',
          description: e.message || 'Please try again',
          variant: 'destructive',
        });
      } finally {
        setEstimationSaving(false);
      }
    },
    [
      estimationPoints,
      isCreateMode,
      taskId,
      queryClient,
      boardId,
      toast,
      setEstimationPoints,
      triggerRefresh,
    ]
  );

  const updatePriority = useCallback(
    async (newPriority: TaskPriority | null) => {
      if (newPriority === priority) return;
      setPriority(newPriority);
      if (isCreateMode || !taskId || taskId === 'new') {
        return;
      }

      // Optimistic update - prevents flicker
      queryClient.setQueryData(
        ['tasks', boardId],
        (oldTasks: any[] | undefined) => {
          if (!oldTasks) return oldTasks;
          return oldTasks.map((task) =>
            task.id === taskId ? { ...task, priority: newPriority } : task
          );
        }
      );

      try {
        const { error } = await supabase
          .from('tasks')
          .update({ priority: newPriority })
          .eq('id', taskId);
        if (error) throw error;
        // Notify parent components (e.g., server component refresh)
        // Skip in collaboration mode where realtime sync handles updates
        triggerRefresh();
      } catch (e: any) {
        console.error('Failed updating priority', e);
        // Revert optimistic update on error
        await invalidateTaskCaches(queryClient, boardId);
        toast({
          title: 'Failed to update priority',
          description: e.message || 'Please try again',
          variant: 'destructive',
        });
      }
    },
    [
      priority,
      isCreateMode,
      taskId,
      queryClient,
      boardId,
      toast,
      setPriority,
      triggerRefresh,
    ]
  );

  const updateStartDate = useCallback(
    async (newDate: Date | undefined) => {
      setStartDate(newDate);
      if (isCreateMode || !taskId || taskId === 'new') {
        return;
      }

      const dateString = newDate ? newDate.toISOString() : null;

      // Optimistic update - prevents flicker
      queryClient.setQueryData(
        ['tasks', boardId],
        (oldTasks: any[] | undefined) => {
          if (!oldTasks) return oldTasks;
          return oldTasks.map((task) =>
            task.id === taskId ? { ...task, start_date: dateString } : task
          );
        }
      );

      try {
        const { error } = await supabase
          .from('tasks')
          .update({ start_date: dateString })
          .eq('id', taskId);
        if (error) throw error;
        // Notify parent components (e.g., server component refresh)
        // Skip in collaboration mode where realtime sync handles updates
        triggerRefresh();
      } catch (e: any) {
        console.error('Failed updating start date', e);
        // Revert optimistic update on error
        await invalidateTaskCaches(queryClient, boardId);
        toast({
          title: 'Failed to update start date',
          description: e.message || 'Please try again',
          variant: 'destructive',
        });
      }
    },
    [
      isCreateMode,
      taskId,
      queryClient,
      boardId,
      toast,
      setStartDate,
      triggerRefresh,
    ]
  );

  const updateEndDate = useCallback(
    async (newDate: Date | undefined) => {
      setEndDate(newDate);
      if (isCreateMode || !taskId || taskId === 'new') {
        return;
      }

      const dateString = newDate ? newDate.toISOString() : null;

      // Optimistic update - prevents flicker
      queryClient.setQueryData(
        ['tasks', boardId],
        (oldTasks: any[] | undefined) => {
          if (!oldTasks) return oldTasks;
          return oldTasks.map((task) =>
            task.id === taskId ? { ...task, end_date: dateString } : task
          );
        }
      );

      try {
        const { error } = await supabase
          .from('tasks')
          .update({ end_date: dateString })
          .eq('id', taskId);
        if (error) throw error;
        // Notify parent components (e.g., server component refresh)
        // Skip in collaboration mode where realtime sync handles updates
        triggerRefresh();
      } catch (e: any) {
        console.error('Failed updating end date', e);
        // Revert optimistic update on error
        await invalidateTaskCaches(queryClient, boardId);
        toast({
          title: 'Failed to update end date',
          description: e.message || 'Please try again',
          variant: 'destructive',
        });
      }
    },
    [
      isCreateMode,
      taskId,
      queryClient,
      boardId,
      toast,
      setEndDate,
      triggerRefresh,
    ]
  );

  const updateList = useCallback(
    async (newListId: string) => {
      if (newListId === selectedListId) return;
      setSelectedListId(newListId);
      if (isCreateMode || !taskId || taskId === 'new') {
        return;
      }

      // Optimistic update - prevents flicker
      queryClient.setQueryData(
        ['tasks', boardId],
        (oldTasks: any[] | undefined) => {
          if (!oldTasks) return oldTasks;
          return oldTasks.map((task) =>
            task.id === taskId ? { ...task, list_id: newListId } : task
          );
        }
      );

      try {
        const { error } = await supabase
          .from('tasks')
          .update({ list_id: newListId })
          .eq('id', taskId);
        if (error) throw error;
        // Don't invalidate cache - realtime sync handles updates
        toast({
          title: 'List updated',
          description: 'Task moved to new list',
        });
        // Notify parent components (e.g., server component refresh)
        // Skip in collaboration mode where realtime sync handles updates
        triggerRefresh();
      } catch (e: any) {
        console.error('Failed updating list', e);
        // Revert optimistic update on error
        await invalidateTaskCaches(queryClient, boardId);
        toast({
          title: 'Failed to update list',
          description: e.message || 'Please try again',
          variant: 'destructive',
        });
      }
    },
    [
      selectedListId,
      isCreateMode,
      taskId,
      queryClient,
      boardId,
      toast,
      triggerRefresh,
      setSelectedListId,
    ]
  );

  const saveNameToDatabase = useCallback(
    async (newName: string) => {
      const trimmedName = newName.trim();
      if (!trimmedName || trimmedName === (taskName || '').trim()) return;

      if (isCreateMode || !taskId || taskId === 'new') {
        return;
      }

      // Optimistically update the cache instead of invalidating
      // This prevents conflicts with realtime sync
      queryClient.setQueryData(
        ['tasks', boardId],
        (oldTasks: any[] | undefined) => {
          if (!oldTasks) return oldTasks;
          return oldTasks.map((task) =>
            task.id === taskId ? { ...task, name: trimmedName } : task
          );
        }
      );

      try {
        const { error } = await supabase
          .from('tasks')
          .update({ name: trimmedName })
          .eq('id', taskId);
        if (error) throw error;
        // Notify parent components (e.g., server component refresh)
        // Skip in collaboration mode where realtime sync handles updates
        triggerRefresh();
      } catch (e: any) {
        console.error('Failed updating task name', e);
        // Revert optimistic update on error by invalidating to refetch
        await invalidateTaskCaches(queryClient, boardId);
        toast({
          title: 'Failed to update task name',
          description: e.message || 'Please try again',
          variant: 'destructive',
        });
      }
    },
    [
      taskName,
      taskId,
      isCreateMode,
      queryClient,
      boardId,
      toast,
      triggerRefresh,
    ]
  );

  const saveSchedulingSettings = useCallback(
    async (settings: SchedulingSettings): Promise<boolean> => {
      if (isCreateMode || !taskId || taskId === 'new') {
        // In create mode, settings will be saved when the task is created
        return true;
      }

      setSchedulingSaving(true);

      // Optimistic update - scoped to the current user.
      // Scheduling is personal: multiple users can have different settings for the same task.
      queryClient.setQueryData(['task-user-scheduling', taskId], settings);

      try {
        const {
          data: { user },
          error: authError,
        } = await supabase.auth.getUser();
        if (authError || !user?.id)
          throw authError ?? new Error('Not signed in');

        // NOTE: table is added via migration: task_user_scheduling_settings
        // Using `any` types until the user runs migrations + typegen.
        const { error } = await (supabase as any)
          .from('task_user_scheduling_settings')
          .upsert(
            {
              task_id: taskId,
              user_id: user.id,
              total_duration: settings.totalDuration,
              is_splittable: settings.isSplittable,
              min_split_duration_minutes: settings.minSplitDurationMinutes,
              max_split_duration_minutes: settings.maxSplitDurationMinutes,
              calendar_hours: settings.calendarHours,
              auto_schedule: settings.autoSchedule,
            },
            { onConflict: 'task_id,user_id' }
          );

        if (error) throw error;

        // Keep any related query data consistent
        queryClient.invalidateQueries({
          queryKey: ['task-personal-schedule', taskId],
        });

        toast({
          title: 'Scheduling settings saved',
          description:
            'Saved to your personal scheduling profile for this task.',
        });

        // Notify parent components (e.g., server component refresh)
        // Skip in collaboration mode where realtime sync handles updates
        triggerRefresh();
        return true;
      } catch (e: any) {
        console.error('Failed updating scheduling settings', e);
        // Revert optimistic update on error
        queryClient.invalidateQueries({
          queryKey: ['task-user-scheduling', taskId],
        });
        toast({
          title: 'Failed to save scheduling settings',
          description: e.message || 'Please try again',
          variant: 'destructive',
        });
        return false;
      } finally {
        setSchedulingSaving(false);
      }
    },
    [isCreateMode, taskId, queryClient, toast, triggerRefresh]
  );

  return {
    updateEstimation,
    updatePriority,
    updateStartDate,
    updateEndDate,
    updateList,
    saveNameToDatabase,
    saveSchedulingSettings,
    estimationSaving,
    schedulingSaving,
  };
}
