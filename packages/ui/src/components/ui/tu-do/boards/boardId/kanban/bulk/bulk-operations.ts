/**
 * Bulk operations for kanban board using TanStack Query mutations
 * Handles batch updates for multiple selected tasks with proper optimistic updates
 *
 * Key Design Principles:
 * - Uses TanStack Query useMutation for all operations
 * - Optimistic updates with automatic rollback on error
 * - Cancels outgoing refetches to prevent race conditions
 * - No manual invalidation - relies on mutation lifecycle
 */

import { type QueryClient, useMutation } from '@tanstack/react-query';
import type { SupabaseClient } from '@tuturuuu/supabase/next/client';
import type { Task } from '@tuturuuu/types/primitives/Task';
import type { TaskList } from '@tuturuuu/types/primitives/TaskList';
import { toast } from '@tuturuuu/ui/sonner';
import type { WorkspaceLabel } from '@tuturuuu/utils/task-helper';
import { moveTaskToBoard } from '@tuturuuu/utils/task-helper';
import { useEffect } from 'react';
import { calculateDaysUntilEndOfWeek } from '../../../../utils/weekDateUtils';

interface WorkspaceProject {
  id: string;
  name: string;
  status: string | null;
}

interface WorkspaceMember {
  id: string;
  display_name: string;
  email: string;
  avatar_url: string | null;
}

interface BulkOperationsConfig {
  queryClient: QueryClient;
  supabase: SupabaseClient;
  boardId: string;
  selectedTasks: Set<string>;
  columns: TaskList[];
  workspaceLabels?: WorkspaceLabel[];
  workspaceProjects?: WorkspaceProject[];
  workspaceMembers?: WorkspaceMember[];
  weekStartsOn?: 0 | 1 | 6;
  setBulkWorking: (working: boolean) => void;
  clearSelection: () => void;
  setBulkDeleteOpen: (open: boolean) => void;
}

/**
 * Bulk update priority mutation
 */
function useBulkUpdatePriority(
  queryClient: QueryClient,
  supabase: SupabaseClient,
  boardId: string
) {
  return useMutation({
    mutationFn: async ({
      priority,
      taskIds,
    }: {
      priority: Task['priority'] | null;
      taskIds: string[];
    }) => {
      console.log('🔄 Bulk priority mutation called with taskIds:', taskIds);
      // Update one by one to ensure triggers fire for each task
      let successCount = 0;
      const failures: Array<{ taskId: string; error: string }> = [];
      for (const taskId of taskIds) {
        const { error } = await supabase
          .from('tasks')
          .update({ priority })
          .eq('id', taskId);
        if (error) {
          failures.push({ taskId, error: error.message });
        } else {
          successCount++;
        }
      }
      // If all failed, throw to trigger onError handler
      if (successCount === 0) {
        throw new Error(
          `Failed to update priority for all ${taskIds.length} tasks`
        );
      }
      return { count: successCount, priority, taskIds, failures };
    },
    onMutate: async ({ priority, taskIds }) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: ['tasks', boardId] });

      // Snapshot previous state
      const previousTasks = queryClient.getQueryData(['tasks', boardId]);

      // Optimistic update
      const taskIdSet = new Set(taskIds);
      queryClient.setQueryData(
        ['tasks', boardId],
        (old: Task[] | undefined) => {
          if (!old) return old;
          return old.map((t) => (taskIdSet.has(t.id) ? { ...t, priority } : t));
        }
      );

      return { previousTasks };
    },
    onError: (error, _, context) => {
      // Rollback on error
      if (context?.previousTasks) {
        queryClient.setQueryData(['tasks', boardId], context.previousTasks);
      }
      console.error('Bulk priority update failed', error);
      toast.error('Failed to update priority for selected tasks');
    },
    onSuccess: (data) => {
      console.log(
        `✅ Updated ${data.count} tasks with priority: ${data.priority}`
      );
      if (data.failures && data.failures.length > 0) {
        toast.warning('Partial update completed', {
          description: `${data.count} task${data.count === 1 ? '' : 's'} updated, ${data.failures.length} failed to update`,
        });
      } else {
        toast.success('Priority updated', {
          description: `${data.count} task${data.count === 1 ? '' : 's'} updated`,
        });
      }
    },
  });
}

/**
 * Bulk update estimation mutation
 */
function useBulkUpdateEstimation(
  queryClient: QueryClient,
  supabase: SupabaseClient,
  boardId: string
) {
  return useMutation({
    mutationFn: async ({
      points,
      taskIds,
    }: {
      points: number | null;
      taskIds: string[];
    }) => {
      console.log('🔄 Bulk estimation mutation called with taskIds:', taskIds);
      // Update one by one to ensure triggers fire for each task
      let successCount = 0;
      const failures: Array<{ taskId: string; error: string }> = [];
      for (const taskId of taskIds) {
        const { error } = await supabase
          .from('tasks')
          .update({ estimation_points: points })
          .eq('id', taskId);
        if (error) {
          failures.push({ taskId, error: error.message });
        } else {
          successCount++;
        }
      }
      // If all failed, throw to trigger onError handler
      if (successCount === 0) {
        throw new Error(
          `Failed to update estimation for all ${taskIds.length} tasks`
        );
      }
      return { count: successCount, points, taskIds, failures };
    },
    onMutate: async ({ points, taskIds }) => {
      await queryClient.cancelQueries({ queryKey: ['tasks', boardId] });
      const previousTasks = queryClient.getQueryData(['tasks', boardId]);

      const taskIdSet = new Set(taskIds);
      queryClient.setQueryData(
        ['tasks', boardId],
        (old: Task[] | undefined) => {
          if (!old) return old;
          return old.map((t) =>
            taskIdSet.has(t.id) ? { ...t, estimation_points: points } : t
          );
        }
      );

      return { previousTasks };
    },
    onError: (error, _, context) => {
      if (context?.previousTasks) {
        queryClient.setQueryData(['tasks', boardId], context.previousTasks);
      }
      console.error('Bulk estimation update failed', error);
      toast.error('Failed to update estimation for selected tasks');
    },
    onSuccess: (data) => {
      console.log(
        `✅ Updated ${data.count} tasks with estimation: ${data.points}`
      );
      if (data.failures && data.failures.length > 0) {
        toast.warning('Partial update completed', {
          description: `${data.count} task${data.count === 1 ? '' : 's'} updated, ${data.failures.length} failed to update`,
        });
      } else {
        toast.success('Estimation updated', {
          description: `${data.count} task${data.count === 1 ? '' : 's'} updated`,
        });
      }
    },
  });
}

/**
 * Bulk update due date mutation
 */
function useBulkUpdateDueDate(
  queryClient: QueryClient,
  supabase: SupabaseClient,
  boardId: string,
  weekStartsOn: 0 | 1 | 6 = 0
) {
  return useMutation({
    mutationFn: async ({
      preset,
      taskIds,
    }: {
      preset: 'today' | 'tomorrow' | 'this_week' | 'next_week' | 'clear';
      taskIds: string[];
    }) => {
      console.log('🔄 Bulk due date mutation called with taskIds:', taskIds);
      let newDate: string | null = null;
      if (preset !== 'clear') {
        const d = new Date();
        if (preset === 'tomorrow') {
          d.setDate(d.getDate() + 1);
        } else if (preset === 'this_week') {
          // Calculate days until end of week (respects first day of week setting)
          d.setDate(d.getDate() + calculateDaysUntilEndOfWeek(weekStartsOn));
        } else if (preset === 'next_week') {
          // Calculate days until end of next week
          d.setDate(
            d.getDate() + calculateDaysUntilEndOfWeek(weekStartsOn) + 7
          );
        }
        d.setHours(23, 59, 59, 999);
        newDate = d.toISOString();
      }

      // Update one by one to ensure triggers fire for each task
      let successCount = 0;
      const failures: Array<{ taskId: string; error: string }> = [];
      for (const taskId of taskIds) {
        const { error } = await supabase
          .from('tasks')
          .update({ end_date: newDate })
          .eq('id', taskId);
        if (error) {
          failures.push({ taskId, error: error.message });
        } else {
          successCount++;
        }
      }
      // If all failed, throw to trigger onError handler
      if (successCount === 0) {
        throw new Error(
          `Failed to update due date for all ${taskIds.length} tasks`
        );
      }
      return { count: successCount, end_date: newDate, taskIds, failures };
    },
    onMutate: async ({ preset, taskIds }) => {
      await queryClient.cancelQueries({ queryKey: ['tasks', boardId] });
      const previousTasks = queryClient.getQueryData(['tasks', boardId]);

      let newDate: string | null = null;
      if (preset !== 'clear') {
        const d = new Date();
        if (preset === 'tomorrow') {
          d.setDate(d.getDate() + 1);
        } else if (preset === 'this_week') {
          // Calculate days until end of week (respects first day of week setting)
          d.setDate(d.getDate() + calculateDaysUntilEndOfWeek(weekStartsOn));
        } else if (preset === 'next_week') {
          // Calculate days until end of next week
          d.setDate(
            d.getDate() + calculateDaysUntilEndOfWeek(weekStartsOn) + 7
          );
        }
        d.setHours(23, 59, 59, 999);
        newDate = d.toISOString();
      }

      const taskIdSet = new Set(taskIds);
      queryClient.setQueryData(
        ['tasks', boardId],
        (old: Task[] | undefined) => {
          if (!old) return old;
          return old.map((t) =>
            taskIdSet.has(t.id) ? { ...t, end_date: newDate } : t
          );
        }
      );

      return { previousTasks };
    },
    onError: (error, _, context) => {
      if (context?.previousTasks) {
        queryClient.setQueryData(['tasks', boardId], context.previousTasks);
      }
      console.error('Bulk due date update failed', error);
      toast.error('Failed to update due date for selected tasks');
    },
    onSuccess: (data) => {
      console.log(
        `✅ Updated ${data.count} tasks with due date: ${data.end_date}`
      );
      if (data.failures && data.failures.length > 0) {
        toast.warning('Partial update completed', {
          description: `${data.count} task${data.count === 1 ? '' : 's'} updated, ${data.failures.length} failed to update`,
        });
      } else {
        toast.success('Due date updated', {
          description: `${data.count} task${data.count === 1 ? '' : 's'} updated`,
        });
      }
    },
  });
}

/**
 * Bulk update custom due date mutation
 */
function useBulkUpdateCustomDueDate(
  queryClient: QueryClient,
  supabase: SupabaseClient,
  boardId: string
) {
  return useMutation({
    mutationFn: async ({
      date,
      taskIds,
    }: {
      date: Date | null;
      taskIds: string[];
    }) => {
      console.log(
        '🔄 Bulk custom due date mutation called with taskIds:',
        taskIds
      );
      const newDate = date ? date.toISOString() : null;

      // Update one by one to ensure triggers fire for each task
      let successCount = 0;
      const failures: Array<{ taskId: string; error: string }> = [];
      for (const taskId of taskIds) {
        const { error } = await supabase
          .from('tasks')
          .update({ end_date: newDate })
          .eq('id', taskId);
        if (error) {
          failures.push({ taskId, error: error.message });
        } else {
          successCount++;
        }
      }
      // If all failed, throw to trigger onError handler
      if (successCount === 0) {
        throw new Error(
          `Failed to update due date for all ${taskIds.length} tasks`
        );
      }
      return { count: successCount, end_date: newDate, taskIds, failures };
    },
    onMutate: async ({ date, taskIds }) => {
      await queryClient.cancelQueries({ queryKey: ['tasks', boardId] });
      const previousTasks = queryClient.getQueryData(['tasks', boardId]);

      const newDate = date ? date.toISOString() : null;
      const taskIdSet = new Set(taskIds);
      queryClient.setQueryData(
        ['tasks', boardId],
        (old: Task[] | undefined) => {
          if (!old) return old;
          return old.map((t) =>
            taskIdSet.has(t.id) ? { ...t, end_date: newDate } : t
          );
        }
      );

      return { previousTasks };
    },
    onError: (error, _, context) => {
      if (context?.previousTasks) {
        queryClient.setQueryData(['tasks', boardId], context.previousTasks);
      }
      console.error('Bulk custom due date update failed', error);
      toast.error('Failed to update due date for selected tasks');
    },
    onSuccess: (data) => {
      console.log(
        `✅ Updated ${data.count} tasks with custom due date: ${data.end_date}`
      );
      if (data.failures && data.failures.length > 0) {
        toast.warning('Partial update completed', {
          description: `${data.count} task${data.count === 1 ? '' : 's'} updated, ${data.failures.length} failed to update`,
        });
      } else {
        toast.success('Due date updated', {
          description: `${data.count} task${data.count === 1 ? '' : 's'} updated`,
        });
      }
    },
  });
}

/**
 * Bulk move to board mutation
 */
function useBulkMoveToBoard(
  queryClient: QueryClient,
  supabase: SupabaseClient,
  boardId: string
) {
  return useMutation({
    mutationFn: async ({
      targetBoardId,
      targetListId,
      taskIds,
    }: {
      targetBoardId: string;
      targetListId: string;
      taskIds: string[];
    }) => {
      console.log(
        '🔄 Bulk move to board mutation called with taskIds:',
        taskIds,
        'targetBoardId:',
        targetBoardId
      );

      // Move one by one to ensure triggers fire for each task and consistent logic
      let successCount = 0;
      const failures: Array<{ taskId: string; error: string }> = [];
      const movedTasks: Task[] = [];

      for (const taskId of taskIds) {
        try {
          const result = await moveTaskToBoard(
            supabase,
            taskId,
            targetListId,
            targetBoardId
          );
          movedTasks.push(result.task);
          successCount++;
        } catch (error: any) {
          failures.push({ taskId, error: error.message || 'Unknown error' });
        }
      }

      // If all failed, throw to trigger onError handler
      if (successCount === 0) {
        throw new Error(
          `Failed to move all ${taskIds.length} tasks to board ${targetBoardId}`
        );
      }

      return {
        count: successCount,
        targetBoardId,
        targetListId,
        taskIds,
        failures,
        movedTasks,
      };
    },
    onMutate: async ({ targetBoardId, targetListId, taskIds }) => {
      // Cancel outgoing refetches for both boards
      await queryClient.cancelQueries({ queryKey: ['tasks', boardId] });
      await queryClient.cancelQueries({ queryKey: ['tasks', targetBoardId] });

      const previousTasks = queryClient.getQueryData(['tasks', boardId]);
      const previousTargetTasks = queryClient.getQueryData([
        'tasks',
        targetBoardId,
      ]);

      const taskIdSet = new Set(taskIds);

      // Optimistically remove from source board
      queryClient.setQueryData(
        ['tasks', boardId],
        (old: Task[] | undefined) => {
          if (!old) return old;
          return old.filter((t) => !taskIdSet.has(t.id));
        }
      );

      // Optimistically add to target board (best effort estimation)
      // We need to fetch the tasks from the source cache first to move them
      const tasksToMove = (previousTasks as Task[] | undefined)?.filter((t) =>
        taskIdSet.has(t.id)
      );

      if (tasksToMove && tasksToMove.length > 0) {
        queryClient.setQueryData(
          ['tasks', targetBoardId],
          (old: Task[] | undefined) => {
            if (!old) return old; // If target board not loaded, we don't need to add optimistic updates

            // We need to check target list status for completion to set closed_at correctly
            // This is hard to do optimistically without target list data, so we'll guess or assume active
            // Ideally we'd look up the target list in cache, but let's just update list_id for now
            const optimisticMovedTasks = tasksToMove.map((t) => ({
              ...t,
              list_id: targetListId,
              // We don't change closed_at here because we don't know target list status easily
              // The server response will fix it quickly
            }));

            return [...old, ...optimisticMovedTasks];
          }
        );
      }

      return { previousTasks, previousTargetTasks };
    },
    onError: (error, variables, context) => {
      // Rollback both boards
      if (context?.previousTasks) {
        queryClient.setQueryData(['tasks', boardId], context.previousTasks);
      }
      if (context?.previousTargetTasks) {
        queryClient.setQueryData(
          ['tasks', variables.targetBoardId],
          context.previousTargetTasks
        );
      }
      console.error('Bulk move to board failed', error);
      toast.error('Failed to move selected tasks to another board');
    },
    onSuccess: (data) => {
      console.log(
        `✅ Moved ${data.count} tasks to board ${data.targetBoardId}`
      );
      if (data.failures && data.failures.length > 0) {
        toast.warning('Partial move completed', {
          description: `${data.count} task${data.count === 1 ? '' : 's'} moved, ${data.failures.length} failed to move`,
        });
      } else {
        toast.success('Tasks moved to board', {
          description: `${data.count} task${data.count === 1 ? '' : 's'} moved successfully`,
        });
      }

      // Update target board cache with actual server results (including correct closed_at status)
      if (data.movedTasks && data.movedTasks.length > 0) {
        queryClient.setQueryData(
          ['tasks', data.targetBoardId],
          (old: Task[] | undefined) => {
            if (!old) return [data.movedTasks];

            // Remove any optimistic versions and add real ones
            const movedIds = new Set(data.movedTasks.map((t) => t.id));
            const filteredOld = old.filter((t) => !movedIds.has(t.id));

            return [...filteredOld, ...data.movedTasks];
          }
        );
      }
    },
  });
}

/**
 * Bulk move to list mutation (general - accepts any list ID)
 */
function useBulkMoveToList(
  queryClient: QueryClient,
  supabase: SupabaseClient,
  boardId: string
) {
  return useMutation({
    mutationFn: async ({
      listId,
      listName,
      taskIds,
    }: {
      listId: string;
      listName: string;
      taskIds: string[];
    }) => {
      console.log(
        '🔄 Bulk move to list mutation called with taskIds:',
        taskIds
      );

      // Update one by one to ensure triggers fire for each task
      let successCount = 0;
      const failures: Array<{ taskId: string; error: string }> = [];
      for (const taskId of taskIds) {
        const { error } = await supabase
          .from('tasks')
          .update({ list_id: listId })
          .eq('id', taskId);
        if (error) {
          failures.push({ taskId, error: error.message });
        } else {
          successCount++;
        }
      }
      // If all failed, throw to trigger onError handler
      if (successCount === 0) {
        throw new Error(`Failed to move all ${taskIds.length} tasks to list`);
      }
      return {
        count: successCount,
        listId,
        listName,
        taskIds,
        failures,
      };
    },
    onMutate: async ({ listId, taskIds }) => {
      await queryClient.cancelQueries({ queryKey: ['tasks', boardId] });
      const previousTasks = queryClient.getQueryData(['tasks', boardId]);

      const taskIdSet = new Set(taskIds);
      queryClient.setQueryData(
        ['tasks', boardId],
        (old: Task[] | undefined) => {
          if (!old) return old;
          return old.map((t) =>
            taskIdSet.has(t.id) ? { ...t, list_id: listId } : t
          );
        }
      );

      return { previousTasks };
    },
    onError: (error, _, context) => {
      if (context?.previousTasks) {
        queryClient.setQueryData(['tasks', boardId], context.previousTasks);
      }
      console.error('Bulk move to list failed', error);
      toast.error('Failed to move selected tasks');
    },
    onSuccess: (data) => {
      console.log(`✅ Moved ${data.count} tasks to ${data.listName}`);
      if (data.failures && data.failures.length > 0) {
        toast.warning('Partial move completed', {
          description: `${data.count} task${data.count === 1 ? '' : 's'} moved, ${data.failures.length} failed to move`,
        });
      } else {
        toast.success(`Tasks moved to ${data.listName}`, {
          description: `${data.count} task${data.count === 1 ? '' : 's'} moved successfully`,
        });
      }
    },
  });
}

/**
 * Bulk move to status mutation (for quick actions - done/closed)
 */
function useBulkMoveToStatus(
  queryClient: QueryClient,
  supabase: SupabaseClient,
  boardId: string,
  columns: TaskList[]
) {
  return useMutation({
    mutationFn: async ({
      status,
      taskIds,
    }: {
      status: 'done' | 'closed';
      taskIds: string[];
    }) => {
      console.log(
        '🔄 Bulk move to status mutation called with taskIds:',
        taskIds
      );
      const targetList = columns.find((c) => c.status === status);
      if (!targetList) throw new Error(`No ${status} list found`);

      // Update one by one to ensure triggers fire for each task
      let successCount = 0;
      const failures: Array<{ taskId: string; error: string }> = [];
      for (const taskId of taskIds) {
        const { error } = await supabase
          .from('tasks')
          .update({ list_id: targetList.id })
          .eq('id', taskId);
        if (error) {
          failures.push({ taskId, error: error.message });
        } else {
          successCount++;
        }
      }
      // If all failed, throw to trigger onError handler
      if (successCount === 0) {
        throw new Error(
          `Failed to move all ${taskIds.length} tasks to ${status}`
        );
      }
      return {
        count: successCount,
        status,
        targetListId: targetList.id,
        taskIds,
        failures,
      };
    },
    onMutate: async ({ status, taskIds }) => {
      await queryClient.cancelQueries({ queryKey: ['tasks', boardId] });
      const previousTasks = queryClient.getQueryData(['tasks', boardId]);

      const targetList = columns.find((c) => c.status === status);
      if (!targetList) return { previousTasks };

      const taskIdSet = new Set(taskIds);
      queryClient.setQueryData(
        ['tasks', boardId],
        (old: Task[] | undefined) => {
          if (!old) return old;
          return old.map((t) =>
            taskIdSet.has(t.id) ? { ...t, list_id: targetList.id } : t
          );
        }
      );

      return { previousTasks };
    },
    onError: (error, _, context) => {
      if (context?.previousTasks) {
        queryClient.setQueryData(['tasks', boardId], context.previousTasks);
      }
      console.error('Bulk status move failed', error);
      toast.error('Failed to move selected tasks');
    },
    onSuccess: (data) => {
      console.log(`✅ Moved ${data.count} tasks to ${data.status} list`);
      if (data.failures && data.failures.length > 0) {
        toast.warning('Partial move completed', {
          description: `${data.count} task${data.count === 1 ? '' : 's'} moved, ${data.failures.length} failed to move`,
        });
      } else {
        toast.success(`Tasks moved to ${data.status}`, {
          description: `${data.count} task${data.count === 1 ? '' : 's'} moved successfully`,
        });
      }
    },
  });
}

/**
 * Bulk add label mutation
 */
function useBulkAddLabel(
  queryClient: QueryClient,
  supabase: SupabaseClient,
  boardId: string,
  workspaceLabels: WorkspaceLabel[]
) {
  return useMutation({
    mutationFn: async ({
      labelId,
      taskIds,
    }: {
      labelId: string;
      taskIds: string[];
    }) => {
      console.log('🔄 Bulk add label mutation called with taskIds:', taskIds);

      // Insert one by one to ensure triggers fire for each task
      // Note: We try all tasks - duplicates are handled gracefully
      let successCount = 0;
      const failures: Array<{ taskId: string; error: string }> = [];
      for (const taskId of taskIds) {
        const { error } = await supabase.from('task_labels').insert({
          task_id: taskId,
          label_id: labelId,
        });
        // Ignore duplicate errors (already has label)
        if (
          error &&
          error.code !== '23505' &&
          !String(error.message).toLowerCase().includes('duplicate')
        ) {
          failures.push({ taskId, error: error.message });
        } else {
          successCount++;
        }
      }
      // If all failed, throw to trigger onError handler
      if (successCount === 0) {
        throw new Error(`Failed to add label to all ${taskIds.length} tasks`);
      }

      return { count: successCount, labelId, taskIds, failures };
    },
    onMutate: async ({ labelId, taskIds }) => {
      await queryClient.cancelQueries({ queryKey: ['tasks', boardId] });
      const previousTasks = queryClient.getQueryData(['tasks', boardId]);

      const current = (previousTasks as Task[] | undefined) || [];
      const labelMeta = workspaceLabels.find((l) => l.id === labelId);

      const missingTaskIds = taskIds.filter((id) => {
        const t = current.find((ct) => ct.id === id);
        return !t?.labels?.some((l) => l.id === labelId);
      });

      queryClient.setQueryData(
        ['tasks', boardId],
        (old: Task[] | undefined) => {
          if (!old) return old;
          return old.map((t) => {
            if (!missingTaskIds.includes(t.id)) return t;
            return {
              ...t,
              labels: [
                ...(t.labels || []),
                {
                  id: labelId,
                  name: labelMeta?.name || 'Label',
                  color: labelMeta?.color || '#3b82f6',
                  created_at: new Date().toISOString(),
                },
              ],
            } as Task;
          });
        }
      );

      return { previousTasks };
    },
    onError: (error, _, context) => {
      if (context?.previousTasks) {
        queryClient.setQueryData(['tasks', boardId], context.previousTasks);
      }
      console.error('Bulk add label failed', error);
      toast.error('Failed to add label to selected tasks');
    },
    onSuccess: (data) => {
      const labelMeta = workspaceLabels.find((l) => l.id === data.labelId);
      const labelName = labelMeta?.name || 'Label';
      if (data.failures && data.failures.length > 0) {
        toast.warning('Partial label addition completed', {
          description: `Added "${labelName}" to ${data.count} task${data.count === 1 ? '' : 's'}, ${data.failures.length} failed`,
        });
      } else {
        toast.success('Label added', {
          description: `Added "${labelName}" to ${data.count} task${data.count === 1 ? '' : 's'}`,
        });
      }
    },
  });
}

/**
 * Bulk remove label mutation
 */
function useBulkRemoveLabel(
  queryClient: QueryClient,
  supabase: SupabaseClient,
  boardId: string,
  workspaceLabels: WorkspaceLabel[]
) {
  return useMutation({
    mutationFn: async ({
      labelId,
      taskIds,
    }: {
      labelId: string;
      taskIds: string[];
    }) => {
      console.log(
        '🔄 Bulk remove label mutation called with taskIds:',
        taskIds
      );
      // Delete one by one to ensure triggers fire for each task
      let successCount = 0;
      const failures: Array<{ taskId: string; error: string }> = [];
      for (const taskId of taskIds) {
        const { error } = await supabase
          .from('task_labels')
          .delete()
          .eq('task_id', taskId)
          .eq('label_id', labelId);
        if (error) {
          failures.push({ taskId, error: error.message });
        } else {
          successCount++;
        }
      }
      // If all failed, throw to trigger onError handler
      if (successCount === 0) {
        throw new Error(
          `Failed to remove label from all ${taskIds.length} tasks`
        );
      }
      return { count: successCount, labelId, taskIds, failures };
    },
    onMutate: async ({ labelId, taskIds }) => {
      await queryClient.cancelQueries({ queryKey: ['tasks', boardId] });
      const previousTasks = queryClient.getQueryData(['tasks', boardId]);

      const taskIdSet = new Set(taskIds);
      queryClient.setQueryData(
        ['tasks', boardId],
        (old: Task[] | undefined) => {
          if (!old) return old;
          return old.map((t) =>
            taskIdSet.has(t.id)
              ? {
                  ...t,
                  labels: (t.labels || []).filter((l) => l.id !== labelId),
                }
              : t
          );
        }
      );

      return { previousTasks };
    },
    onError: (error, _, context) => {
      if (context?.previousTasks) {
        queryClient.setQueryData(['tasks', boardId], context.previousTasks);
      }
      console.error('Bulk remove label failed', error);
      toast.error('Failed to remove label from selected tasks');
    },
    onSuccess: (data) => {
      const labelMeta = workspaceLabels.find((l) => l.id === data.labelId);
      const labelName = labelMeta?.name || 'Label';
      if (data.failures && data.failures.length > 0) {
        toast.warning('Partial label removal completed', {
          description: `Removed "${labelName}" from ${data.count} task${data.count === 1 ? '' : 's'}, ${data.failures.length} failed`,
        });
      } else {
        toast.success('Label removed', {
          description: `Removed "${labelName}" from ${data.count} task${data.count === 1 ? '' : 's'}`,
        });
      }
    },
  });
}

/**
 * Bulk add project mutation
 */
function useBulkAddProject(
  queryClient: QueryClient,
  supabase: SupabaseClient,
  boardId: string,
  workspaceProjects: WorkspaceProject[]
) {
  return useMutation({
    mutationFn: async ({
      projectId,
      taskIds,
    }: {
      projectId: string;
      taskIds: string[];
    }) => {
      console.log('🔄 Bulk add project mutation called with taskIds:', taskIds);

      // Insert one by one to ensure triggers fire for each task
      // Note: We try all tasks - duplicates are handled gracefully
      let successCount = 0;
      const failures: Array<{ taskId: string; error: string }> = [];
      for (const taskId of taskIds) {
        const { error } = await supabase.from('task_project_tasks').insert({
          task_id: taskId,
          project_id: projectId,
        });
        // Ignore duplicate errors (already has project)
        if (
          error &&
          error.code !== '23505' &&
          !String(error.message).toLowerCase().includes('duplicate')
        ) {
          failures.push({ taskId, error: error.message });
        } else {
          successCount++;
        }
      }
      // If all failed, throw to trigger onError handler
      if (successCount === 0) {
        throw new Error(`Failed to add project to all ${taskIds.length} tasks`);
      }

      return { count: successCount, projectId, taskIds, failures };
    },
    onMutate: async ({ projectId, taskIds }) => {
      await queryClient.cancelQueries({ queryKey: ['tasks', boardId] });
      const previousTasks = queryClient.getQueryData(['tasks', boardId]);

      const current = (previousTasks as Task[] | undefined) || [];
      const projectMeta = workspaceProjects.find((p) => p.id === projectId);

      const missingTaskIds = taskIds.filter((id) => {
        const t = current.find((ct) => ct.id === id);
        return !t?.projects?.some((p) => p.id === projectId);
      });

      queryClient.setQueryData(
        ['tasks', boardId],
        (old: Task[] | undefined) => {
          if (!old) return old;
          return old.map((t) => {
            if (!missingTaskIds.includes(t.id)) return t;
            return {
              ...t,
              projects: [
                ...(t.projects || []),
                {
                  id: projectId,
                  name: projectMeta?.name || 'Project',
                  status: projectMeta?.status || null,
                },
              ],
            } as Task;
          });
        }
      );

      return { previousTasks };
    },
    onError: (error, _, context) => {
      if (context?.previousTasks) {
        queryClient.setQueryData(['tasks', boardId], context.previousTasks);
      }
      console.error('Bulk add project failed', error);
      toast.error('Failed to add project to selected tasks');
    },
    onSuccess: (data) => {
      const projectMeta = workspaceProjects.find(
        (p) => p.id === data.projectId
      );
      const projectName = projectMeta?.name || 'Project';
      if (data.failures && data.failures.length > 0) {
        toast.warning('Partial project addition completed', {
          description: `Added "${projectName}" to ${data.count} task${data.count === 1 ? '' : 's'}, ${data.failures.length} failed`,
        });
      } else {
        toast.success('Project added', {
          description: `Added "${projectName}" to ${data.count} task${data.count === 1 ? '' : 's'}`,
        });
      }
    },
  });
}

/**
 * Bulk remove project mutation
 */
function useBulkRemoveProject(
  queryClient: QueryClient,
  supabase: SupabaseClient,
  boardId: string,
  workspaceProjects: WorkspaceProject[]
) {
  return useMutation({
    mutationFn: async ({
      projectId,
      taskIds,
    }: {
      projectId: string;
      taskIds: string[];
    }) => {
      console.log(
        '🔄 Bulk remove project mutation called with taskIds:',
        taskIds
      );
      // Delete one by one to ensure triggers fire for each task
      let successCount = 0;
      const failures: Array<{ taskId: string; error: string }> = [];
      for (const taskId of taskIds) {
        const { error } = await supabase
          .from('task_project_tasks')
          .delete()
          .eq('task_id', taskId)
          .eq('project_id', projectId);
        if (error) {
          failures.push({ taskId, error: error.message });
        } else {
          successCount++;
        }
      }
      // If all failed, throw to trigger onError handler
      if (successCount === 0) {
        throw new Error(
          `Failed to remove project from all ${taskIds.length} tasks`
        );
      }
      return { count: successCount, projectId, taskIds, failures };
    },
    onMutate: async ({ projectId, taskIds }) => {
      await queryClient.cancelQueries({ queryKey: ['tasks', boardId] });
      const previousTasks = queryClient.getQueryData(['tasks', boardId]);

      const taskIdSet = new Set(taskIds);
      queryClient.setQueryData(
        ['tasks', boardId],
        (old: Task[] | undefined) => {
          if (!old) return old;
          return old.map((t) =>
            taskIdSet.has(t.id)
              ? {
                  ...t,
                  projects: (t.projects || []).filter(
                    (p) => p.id !== projectId
                  ),
                }
              : t
          );
        }
      );

      return { previousTasks };
    },
    onError: (error, _, context) => {
      if (context?.previousTasks) {
        queryClient.setQueryData(['tasks', boardId], context.previousTasks);
      }
      console.error('Bulk remove project failed', error);
      toast.error('Failed to remove project from selected tasks');
    },
    onSuccess: (data) => {
      const projectMeta = workspaceProjects.find(
        (p) => p.id === data.projectId
      );
      const projectName = projectMeta?.name || 'Project';
      if (data.failures && data.failures.length > 0) {
        toast.warning('Partial project removal completed', {
          description: `Removed "${projectName}" from ${data.count} task${data.count === 1 ? '' : 's'}, ${data.failures.length} failed`,
        });
      } else {
        toast.success('Project removed', {
          description: `Removed "${projectName}" from ${data.count} task${data.count === 1 ? '' : 's'}`,
        });
      }
    },
  });
}

/**
 * Bulk add assignee mutation
 */
function useBulkAddAssignee(
  queryClient: QueryClient,
  supabase: SupabaseClient,
  boardId: string,
  workspaceMembers: WorkspaceMember[] = []
) {
  return useMutation({
    mutationFn: async ({
      assigneeId,
      taskIds,
    }: {
      assigneeId: string;
      taskIds: string[];
    }) => {
      console.log(
        '🔄 Bulk add assignee mutation called with taskIds:',
        taskIds
      );

      // Insert one by one to ensure triggers fire for each task
      // Note: We try all tasks - duplicates are handled gracefully
      let successCount = 0;
      const failures: Array<{ taskId: string; error: string }> = [];
      for (const taskId of taskIds) {
        const { error } = await supabase.from('task_assignees').insert({
          task_id: taskId,
          user_id: assigneeId,
        });
        // Ignore duplicate errors (already has assignee)
        if (
          error &&
          error.code !== '23505' &&
          !String(error.message).toLowerCase().includes('duplicate')
        ) {
          failures.push({ taskId, error: error.message });
        } else {
          successCount++;
        }
      }
      // If all failed, throw to trigger onError handler
      if (successCount === 0) {
        throw new Error(
          `Failed to add assignee to all ${taskIds.length} tasks`
        );
      }

      return { count: successCount, assigneeId, taskIds, failures };
    },
    onMutate: async ({ assigneeId, taskIds }) => {
      await queryClient.cancelQueries({ queryKey: ['tasks', boardId] });
      const previousTasks = queryClient.getQueryData(['tasks', boardId]);

      const current = (previousTasks as Task[] | undefined) || [];

      const missingTaskIds = taskIds.filter((id) => {
        const t = current.find((ct) => ct.id === id);
        return !t?.assignees?.some((a) => a.id === assigneeId);
      });

      // Look up assignee data from workspace members if available
      const member = workspaceMembers.find((m) => m.id === assigneeId);
      const assigneeData = member || {
        id: assigneeId,
        display_name: 'Loading...',
        email: '',
        avatar_url: null,
      };

      queryClient.setQueryData(
        ['tasks', boardId],
        (old: Task[] | undefined) => {
          if (!old) return old;
          return old.map((t) => {
            if (!missingTaskIds.includes(t.id)) return t;
            // Use real assignee data if available, otherwise use placeholder
            // The realtime subscription will reconcile the final data
            return {
              ...t,
              assignees: [...(t.assignees || []), assigneeData],
            } as Task;
          });
        }
      );

      return { previousTasks };
    },
    onError: (error, _, context) => {
      if (context?.previousTasks) {
        queryClient.setQueryData(['tasks', boardId], context.previousTasks);
      }
      console.error('Bulk add assignee failed', error);
      toast.error('Failed to add assignee to selected tasks');
    },
    onSuccess: (data) => {
      if (data.failures && data.failures.length > 0) {
        toast.warning('Partial assignee addition completed', {
          description: `Added assignee to ${data.count} task${data.count === 1 ? '' : 's'}, ${data.failures.length} failed`,
        });
      } else {
        toast.success('Assignee added', {
          description: `Added assignee to ${data.count} task${data.count === 1 ? '' : 's'}`,
        });
      }
    },
  });
}

/**
 * Bulk remove assignee mutation
 */
function useBulkRemoveAssignee(
  queryClient: QueryClient,
  supabase: SupabaseClient,
  boardId: string
) {
  return useMutation({
    mutationFn: async ({
      assigneeId,
      taskIds,
    }: {
      assigneeId: string;
      taskIds: string[];
    }) => {
      console.log(
        '🔄 Bulk remove assignee mutation called with taskIds:',
        taskIds
      );
      // Delete one by one to ensure triggers fire for each task
      let successCount = 0;
      const failures: Array<{ taskId: string; error: string }> = [];
      for (const taskId of taskIds) {
        const { error } = await supabase
          .from('task_assignees')
          .delete()
          .eq('task_id', taskId)
          .eq('user_id', assigneeId);
        if (error) {
          failures.push({ taskId, error: error.message });
        } else {
          successCount++;
        }
      }
      // If all failed, throw to trigger onError handler
      if (successCount === 0) {
        throw new Error(
          `Failed to remove assignee from all ${taskIds.length} tasks`
        );
      }
      return { count: successCount, assigneeId, taskIds, failures };
    },
    onMutate: async ({ assigneeId, taskIds }) => {
      await queryClient.cancelQueries({ queryKey: ['tasks', boardId] });
      const previousTasks = queryClient.getQueryData(['tasks', boardId]);

      const taskIdSet = new Set(taskIds);
      queryClient.setQueryData(
        ['tasks', boardId],
        (old: Task[] | undefined) => {
          if (!old) return old;
          return old.map((t) =>
            taskIdSet.has(t.id)
              ? {
                  ...t,
                  assignees: (t.assignees || []).filter(
                    (a) => a.id !== assigneeId
                  ),
                }
              : t
          );
        }
      );

      return { previousTasks };
    },
    onError: (error, _, context) => {
      if (context?.previousTasks) {
        queryClient.setQueryData(['tasks', boardId], context.previousTasks);
      }
      console.error('Bulk remove assignee failed', error);
      toast.error('Failed to remove assignee from selected tasks');
    },
    onSuccess: (data) => {
      if (data.failures && data.failures.length > 0) {
        toast.warning('Partial assignee removal completed', {
          description: `Removed assignee from ${data.count} task${data.count === 1 ? '' : 's'}, ${data.failures.length} failed`,
        });
      } else {
        toast.success('Assignee removed', {
          description: `Removed assignee from ${data.count} task${data.count === 1 ? '' : 's'}`,
        });
      }
    },
  });
}

/**
 * Bulk clear ALL labels from selected tasks
 */
function useBulkClearLabels(
  queryClient: QueryClient,
  supabase: SupabaseClient,
  boardId: string
) {
  return useMutation({
    mutationFn: async ({ taskIds }: { taskIds: string[] }) => {
      console.log(
        '🔄 Bulk clear labels mutation called with taskIds:',
        taskIds
      );
      // Delete one by one to ensure triggers fire for each task
      let successCount = 0;
      const failures: Array<{ taskId: string; error: string }> = [];
      for (const taskId of taskIds) {
        const { error } = await supabase
          .from('task_labels')
          .delete()
          .eq('task_id', taskId);
        if (error) {
          failures.push({ taskId, error: error.message });
        } else {
          successCount++;
        }
      }
      // If all failed, throw to trigger onError handler
      if (successCount === 0 && taskIds.length > 0) {
        throw new Error(
          `Failed to clear labels from all ${taskIds.length} tasks`
        );
      }
      return { count: successCount, taskIds, failures };
    },
    onMutate: async ({ taskIds }) => {
      await queryClient.cancelQueries({ queryKey: ['tasks', boardId] });
      const previousTasks = queryClient.getQueryData(['tasks', boardId]);

      const taskIdSet = new Set(taskIds);
      queryClient.setQueryData(
        ['tasks', boardId],
        (old: Task[] | undefined) => {
          if (!old) return old;
          return old.map((t) =>
            taskIdSet.has(t.id) ? { ...t, labels: [] } : t
          );
        }
      );

      return { previousTasks };
    },
    onError: (error, _, context) => {
      if (context?.previousTasks) {
        queryClient.setQueryData(['tasks', boardId], context.previousTasks);
      }
      console.error('Bulk clear labels failed', error);
      toast.error('Failed to clear labels from selected tasks');
    },
    onSuccess: (data) => {
      if (data.failures && data.failures.length > 0) {
        toast.warning('Partial label clear completed', {
          description: `Cleared labels from ${data.count} task${data.count === 1 ? '' : 's'}, ${data.failures.length} failed`,
        });
      } else {
        toast.success('Labels cleared', {
          description: `Cleared all labels from ${data.count} task${data.count === 1 ? '' : 's'}`,
        });
      }
    },
  });
}

/**
 * Bulk clear ALL projects from selected tasks
 */
function useBulkClearProjects(
  queryClient: QueryClient,
  supabase: SupabaseClient,
  boardId: string
) {
  return useMutation({
    mutationFn: async ({ taskIds }: { taskIds: string[] }) => {
      console.log(
        '🔄 Bulk clear projects mutation called with taskIds:',
        taskIds
      );
      // Delete one by one to ensure triggers fire for each task
      let successCount = 0;
      const failures: Array<{ taskId: string; error: string }> = [];
      for (const taskId of taskIds) {
        const { error } = await supabase
          .from('task_project_tasks')
          .delete()
          .eq('task_id', taskId);
        if (error) {
          failures.push({ taskId, error: error.message });
        } else {
          successCount++;
        }
      }
      // If all failed, throw to trigger onError handler
      if (successCount === 0 && taskIds.length > 0) {
        throw new Error(
          `Failed to clear projects from all ${taskIds.length} tasks`
        );
      }
      return { count: successCount, taskIds, failures };
    },
    onMutate: async ({ taskIds }) => {
      await queryClient.cancelQueries({ queryKey: ['tasks', boardId] });
      const previousTasks = queryClient.getQueryData(['tasks', boardId]);

      const taskIdSet = new Set(taskIds);
      queryClient.setQueryData(
        ['tasks', boardId],
        (old: Task[] | undefined) => {
          if (!old) return old;
          return old.map((t) =>
            taskIdSet.has(t.id) ? { ...t, projects: [] } : t
          );
        }
      );

      return { previousTasks };
    },
    onError: (error, _, context) => {
      if (context?.previousTasks) {
        queryClient.setQueryData(['tasks', boardId], context.previousTasks);
      }
      console.error('Bulk clear projects failed', error);
      toast.error('Failed to clear projects from selected tasks');
    },
    onSuccess: (data) => {
      if (data.failures && data.failures.length > 0) {
        toast.warning('Partial project clear completed', {
          description: `Cleared projects from ${data.count} task${data.count === 1 ? '' : 's'}, ${data.failures.length} failed`,
        });
      } else {
        toast.success('Projects cleared', {
          description: `Cleared all projects from ${data.count} task${data.count === 1 ? '' : 's'}`,
        });
      }
    },
  });
}

/**
 * Bulk clear ALL assignees from selected tasks
 */
function useBulkClearAssignees(
  queryClient: QueryClient,
  supabase: SupabaseClient,
  boardId: string
) {
  return useMutation({
    mutationFn: async ({ taskIds }: { taskIds: string[] }) => {
      console.log(
        '🔄 Bulk clear assignees mutation called with taskIds:',
        taskIds
      );
      // Delete one by one to ensure triggers fire for each task
      let successCount = 0;
      const failures: Array<{ taskId: string; error: string }> = [];
      for (const taskId of taskIds) {
        const { error } = await supabase
          .from('task_assignees')
          .delete()
          .eq('task_id', taskId);
        if (error) {
          failures.push({ taskId, error: error.message });
        } else {
          successCount++;
        }
      }
      // If all failed, throw to trigger onError handler
      if (successCount === 0 && taskIds.length > 0) {
        throw new Error(
          `Failed to clear assignees from all ${taskIds.length} tasks`
        );
      }
      return { count: successCount, taskIds, failures };
    },
    onMutate: async ({ taskIds }) => {
      await queryClient.cancelQueries({ queryKey: ['tasks', boardId] });
      const previousTasks = queryClient.getQueryData(['tasks', boardId]);

      const taskIdSet = new Set(taskIds);
      queryClient.setQueryData(
        ['tasks', boardId],
        (old: Task[] | undefined) => {
          if (!old) return old;
          return old.map((t) =>
            taskIdSet.has(t.id) ? { ...t, assignees: [] } : t
          );
        }
      );

      return { previousTasks };
    },
    onError: (error, _, context) => {
      if (context?.previousTasks) {
        queryClient.setQueryData(['tasks', boardId], context.previousTasks);
      }
      console.error('Bulk clear assignees failed', error);
      toast.error('Failed to clear assignees from selected tasks');
    },
    onSuccess: (data) => {
      if (data.failures && data.failures.length > 0) {
        toast.warning('Partial assignee clear completed', {
          description: `Cleared assignees from ${data.count} task${data.count === 1 ? '' : 's'}, ${data.failures.length} failed`,
        });
      } else {
        toast.success('Assignees cleared', {
          description: `Cleared all assignees from ${data.count} task${data.count === 1 ? '' : 's'}`,
        });
      }
    },
  });
}

/**
 * Bulk delete tasks mutation
 */
function useBulkDeleteTasks(
  queryClient: QueryClient,
  supabase: SupabaseClient,
  boardId: string,
  clearSelection: () => void,
  setBulkDeleteOpen: (open: boolean) => void
) {
  return useMutation({
    mutationFn: async ({ taskIds }: { taskIds: string[] }) => {
      console.log('🔄 Bulk delete mutation called with taskIds:', taskIds);
      // Update one by one to ensure triggers fire for each task
      let successCount = 0;
      const failures: Array<{ taskId: string; error: string }> = [];
      for (const taskId of taskIds) {
        const { error } = await supabase
          .from('tasks')
          .update({ deleted_at: new Date().toISOString() })
          .eq('id', taskId);
        if (error) {
          failures.push({ taskId, error: error.message });
        } else {
          successCount++;
        }
      }
      // If all failed, throw to trigger onError handler
      if (successCount === 0) {
        throw new Error(`Failed to delete all ${taskIds.length} tasks`);
      }
      return { count: successCount, taskIds, failures };
    },
    onMutate: async ({ taskIds }) => {
      await queryClient.cancelQueries({ queryKey: ['tasks', boardId] });
      const previousTasks = queryClient.getQueryData(['tasks', boardId]);

      // Optimistically remove from cache
      const taskIdSet = new Set(taskIds);
      queryClient.setQueryData(
        ['tasks', boardId],
        (old: Task[] | undefined) => {
          if (!old) return old;
          return old.filter((t) => !taskIdSet.has(t.id));
        }
      );

      return { previousTasks };
    },
    onError: (error, _, context) => {
      if (context?.previousTasks) {
        queryClient.setQueryData(['tasks', boardId], context.previousTasks);
      }
      console.error('Bulk delete failed', error);
      toast.error('Failed to delete selected tasks');
    },
    onSuccess: (data) => {
      console.log(`✅ Deleted ${data.count} tasks`);
      clearSelection();
      setBulkDeleteOpen(false);
      if (data.failures && data.failures.length > 0) {
        toast.warning('Partial deletion completed', {
          description: `${data.count} task${data.count === 1 ? '' : 's'} deleted, ${data.failures.length} failed to delete`,
        });
      } else {
        toast.success('Deleted selected tasks');
      }
    },
  });
}

/**
 * Hook that creates all bulk operations using TanStack Query mutations
 */
export function useBulkOperations(config: BulkOperationsConfig) {
  const {
    queryClient,
    supabase,
    boardId,
    selectedTasks,
    columns,
    workspaceLabels = [],
    workspaceProjects = [],
    workspaceMembers = [],
    weekStartsOn = 0,
    setBulkWorking,
    clearSelection,
    setBulkDeleteOpen,
  } = config;

  // Create all mutations (pass taskIds at call time, not hook creation time)
  const priorityMutation = useBulkUpdatePriority(
    queryClient,
    supabase,
    boardId
  );
  const estimationMutation = useBulkUpdateEstimation(
    queryClient,
    supabase,
    boardId
  );
  const dueDateMutation = useBulkUpdateDueDate(
    queryClient,
    supabase,
    boardId,
    weekStartsOn
  );
  const customDueDateMutation = useBulkUpdateCustomDueDate(
    queryClient,
    supabase,
    boardId
  );
  const moveToListMutation = useBulkMoveToList(queryClient, supabase, boardId);
  const statusMutation = useBulkMoveToStatus(
    queryClient,
    supabase,
    boardId,
    columns
  );
  const addLabelMutation = useBulkAddLabel(
    queryClient,
    supabase,
    boardId,
    workspaceLabels
  );
  const removeLabelMutation = useBulkRemoveLabel(
    queryClient,
    supabase,
    boardId,
    workspaceLabels
  );
  const addProjectMutation = useBulkAddProject(
    queryClient,
    supabase,
    boardId,
    workspaceProjects
  );
  const removeProjectMutation = useBulkRemoveProject(
    queryClient,
    supabase,
    boardId,
    workspaceProjects
  );
  const addAssigneeMutation = useBulkAddAssignee(
    queryClient,
    supabase,
    boardId,
    workspaceMembers
  );
  const removeAssigneeMutation = useBulkRemoveAssignee(
    queryClient,
    supabase,
    boardId
  );
  const clearLabelsMutation = useBulkClearLabels(
    queryClient,
    supabase,
    boardId
  );
  const clearProjectsMutation = useBulkClearProjects(
    queryClient,
    supabase,
    boardId
  );
  const clearAssigneesMutation = useBulkClearAssignees(
    queryClient,
    supabase,
    boardId
  );
  const deleteMutation = useBulkDeleteTasks(
    queryClient,
    supabase,
    boardId,
    clearSelection,
    setBulkDeleteOpen
  );
  const moveToBoardMutation = useBulkMoveToBoard(
    queryClient,
    supabase,
    boardId
  );

  // Track loading state
  const isAnyMutationPending =
    priorityMutation.isPending ||
    estimationMutation.isPending ||
    dueDateMutation.isPending ||
    customDueDateMutation.isPending ||
    moveToListMutation.isPending ||
    statusMutation.isPending ||
    addLabelMutation.isPending ||
    removeLabelMutation.isPending ||
    addProjectMutation.isPending ||
    removeProjectMutation.isPending ||
    addAssigneeMutation.isPending ||
    removeAssigneeMutation.isPending ||
    clearLabelsMutation.isPending ||
    clearProjectsMutation.isPending ||
    clearAssigneesMutation.isPending ||
    deleteMutation.isPending ||
    moveToBoardMutation.isPending;

  // Update bulk working state (side effect, not memoization)
  useEffect(() => {
    setBulkWorking(isAnyMutationPending);
  }, [isAnyMutationPending, setBulkWorking]);

  // Helper to get list ID by status
  function getListIdByStatus(status: 'done' | 'closed'): string | null {
    const list = columns.find((c) => c.status === status);
    return list ? String(list.id) : null;
  }

  // Return wrapped mutation functions
  // IMPORTANT: Capture taskIds at call time, not at hook creation time
  return {
    bulkUpdatePriority: async (priority: Task['priority'] | null) => {
      const taskIds = Array.from(selectedTasks);
      if (taskIds.length === 0) return;
      await priorityMutation.mutateAsync({ priority, taskIds });
    },
    bulkUpdateEstimation: async (points: number | null) => {
      const taskIds = Array.from(selectedTasks);
      if (taskIds.length === 0) return;
      await estimationMutation.mutateAsync({ points, taskIds });
    },
    bulkUpdateDueDate: async (
      preset: 'today' | 'tomorrow' | 'this_week' | 'next_week' | 'clear'
    ) => {
      const taskIds = Array.from(selectedTasks);
      if (taskIds.length === 0) return;
      await dueDateMutation.mutateAsync({ preset, taskIds });
    },
    bulkUpdateCustomDueDate: async (date: Date | null) => {
      const taskIds = Array.from(selectedTasks);
      if (taskIds.length === 0) return;
      await customDueDateMutation.mutateAsync({ date, taskIds });
    },
    bulkMoveToList: async (listId: string, listName: string) => {
      const taskIds = Array.from(selectedTasks);
      if (taskIds.length === 0) return;
      await moveToListMutation.mutateAsync({ listId, listName, taskIds });
    },
    bulkMoveToStatus: async (status: 'done' | 'closed') => {
      const taskIds = Array.from(selectedTasks);
      if (taskIds.length === 0) return;
      const listId = getListIdByStatus(status);
      if (!listId) return;
      await statusMutation.mutateAsync({ status, taskIds });
    },
    bulkAddLabel: async (labelId: string) => {
      const taskIds = Array.from(selectedTasks);
      if (taskIds.length === 0) return;
      await addLabelMutation.mutateAsync({ labelId, taskIds });
    },
    bulkRemoveLabel: async (labelId: string) => {
      const taskIds = Array.from(selectedTasks);
      if (taskIds.length === 0) return;
      await removeLabelMutation.mutateAsync({ labelId, taskIds });
    },
    bulkAddProject: async (projectId: string) => {
      const taskIds = Array.from(selectedTasks);
      if (taskIds.length === 0) return;
      await addProjectMutation.mutateAsync({ projectId, taskIds });
    },
    bulkRemoveProject: async (projectId: string) => {
      const taskIds = Array.from(selectedTasks);
      if (taskIds.length === 0) return;
      await removeProjectMutation.mutateAsync({ projectId, taskIds });
    },
    bulkAddAssignee: async (assigneeId: string) => {
      const taskIds = Array.from(selectedTasks);
      if (taskIds.length === 0) return;
      await addAssigneeMutation.mutateAsync({ assigneeId, taskIds });
    },
    bulkRemoveAssignee: async (assigneeId: string) => {
      const taskIds = Array.from(selectedTasks);
      if (taskIds.length === 0) return;
      await removeAssigneeMutation.mutateAsync({ assigneeId, taskIds });
    },
    bulkClearLabels: async () => {
      const taskIds = Array.from(selectedTasks);
      if (taskIds.length === 0) return;
      await clearLabelsMutation.mutateAsync({ taskIds });
    },
    bulkClearProjects: async () => {
      const taskIds = Array.from(selectedTasks);
      if (taskIds.length === 0) return;
      await clearProjectsMutation.mutateAsync({ taskIds });
    },
    bulkClearAssignees: async () => {
      const taskIds = Array.from(selectedTasks);
      if (taskIds.length === 0) return;
      await clearAssigneesMutation.mutateAsync({ taskIds });
    },
    bulkDeleteTasks: async () => {
      const taskIds = Array.from(selectedTasks);
      if (taskIds.length === 0) return;
      await deleteMutation.mutateAsync({ taskIds });
    },
    bulkMoveToBoard: async (targetBoardId: string, targetListId: string) => {
      const taskIds = Array.from(selectedTasks);
      if (taskIds.length === 0) return;
      await moveToBoardMutation.mutateAsync({
        targetBoardId,
        targetListId,
        taskIds,
      });
    },
    getListIdByStatus,
  };
}

// Backward compatibility: Keep the old factory function signature but mark as deprecated
export function createBulkOperations(_config: BulkOperationsConfig): never {
  // This factory function has been deprecated in favor of useBulkOperations hook
  // The kanban component should use useBulkOperations directly for proper React Query integration
  throw new Error(
    'createBulkOperations is deprecated. Use useBulkOperations hook instead.'
  );
}
