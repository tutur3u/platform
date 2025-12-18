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
import { useEffect } from 'react';

interface WorkspaceProject {
  id: string;
  name: string;
  status: string | null;
}

interface BulkOperationsConfig {
  queryClient: QueryClient;
  supabase: SupabaseClient;
  boardId: string;
  selectedTasks: Set<string>;
  columns: TaskList[];
  workspaceLabels?: WorkspaceLabel[];
  workspaceProjects?: WorkspaceProject[];
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
      for (const taskId of taskIds) {
        const { error } = await supabase
          .from('tasks')
          .update({ priority })
          .eq('id', taskId);
        if (error) {
          console.error(`Failed to update priority for task ${taskId}:`, error);
        } else {
          successCount++;
        }
      }
      return { count: successCount, priority, taskIds };
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
      toast.success('Priority updated', {
        description: `${data.count} task${data.count === 1 ? '' : 's'} updated`,
      });
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
      for (const taskId of taskIds) {
        const { error } = await supabase
          .from('tasks')
          .update({ estimation_points: points })
          .eq('id', taskId);
        if (error) {
          console.error(
            `Failed to update estimation for task ${taskId}:`,
            error
          );
        } else {
          successCount++;
        }
      }
      return { count: successCount, points, taskIds };
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
      toast.success('Estimation updated', {
        description: `${data.count} task${data.count === 1 ? '' : 's'} updated`,
      });
    },
  });
}

/**
 * Bulk update due date mutation
 */
function useBulkUpdateDueDate(
  queryClient: QueryClient,
  supabase: SupabaseClient,
  boardId: string
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
          // Calculate days until Sunday (0 = Sunday)
          const currentDay = d.getDay();
          const daysUntilSunday = currentDay === 0 ? 7 : 7 - currentDay;
          d.setDate(d.getDate() + daysUntilSunday);
        } else if (preset === 'next_week') {
          // Calculate days until next Sunday
          const currentDay = d.getDay();
          const daysUntilSunday = currentDay === 0 ? 7 : 7 - currentDay;
          d.setDate(d.getDate() + daysUntilSunday + 7);
        }
        d.setHours(23, 59, 59, 999);
        newDate = d.toISOString();
      }

      // Update one by one to ensure triggers fire for each task
      let successCount = 0;
      for (const taskId of taskIds) {
        const { error } = await supabase
          .from('tasks')
          .update({ end_date: newDate })
          .eq('id', taskId);
        if (error) {
          console.error(`Failed to update due date for task ${taskId}:`, error);
        } else {
          successCount++;
        }
      }
      return { count: successCount, end_date: newDate, taskIds };
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
          // Calculate days until Sunday (0 = Sunday)
          const currentDay = d.getDay();
          const daysUntilSunday = currentDay === 0 ? 7 : 7 - currentDay;
          d.setDate(d.getDate() + daysUntilSunday);
        } else if (preset === 'next_week') {
          // Calculate days until next Sunday
          const currentDay = d.getDay();
          const daysUntilSunday = currentDay === 0 ? 7 : 7 - currentDay;
          d.setDate(d.getDate() + daysUntilSunday + 7);
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
      toast.success('Due date updated', {
        description: `${data.count} task${data.count === 1 ? '' : 's'} updated`,
      });
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
      console.log('🔄 Bulk custom due date mutation called with taskIds:', taskIds);
      const newDate = date ? date.toISOString() : null;

      // Update one by one to ensure triggers fire for each task
      let successCount = 0;
      for (const taskId of taskIds) {
        const { error } = await supabase
          .from('tasks')
          .update({ end_date: newDate })
          .eq('id', taskId);
        if (error) {
          console.error(`Failed to update due date for task ${taskId}:`, error);
        } else {
          successCount++;
        }
      }
      return { count: successCount, end_date: newDate, taskIds };
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
      toast.success('Due date updated', {
        description: `${data.count} task${data.count === 1 ? '' : 's'} updated`,
      });
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
      console.log('🔄 Bulk move to list mutation called with taskIds:', taskIds);

      // Update one by one to ensure triggers fire for each task
      let successCount = 0;
      for (const taskId of taskIds) {
        const { error } = await supabase
          .from('tasks')
          .update({ list_id: listId })
          .eq('id', taskId);
        if (error) {
          console.error(`Failed to move task ${taskId} to list:`, error);
        } else {
          successCount++;
        }
      }
      return {
        count: successCount,
        listId,
        listName,
        taskIds,
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
      toast.success(`Tasks moved to ${data.listName}`, {
        description: `${data.count} task${data.count === 1 ? '' : 's'} moved successfully`,
      });
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
      for (const taskId of taskIds) {
        const { error } = await supabase
          .from('tasks')
          .update({ list_id: targetList.id })
          .eq('id', taskId);
        if (error) {
          console.error(`Failed to move task ${taskId} to ${status}:`, error);
        } else {
          successCount++;
        }
      }
      return {
        count: successCount,
        status,
        targetListId: targetList.id,
        taskIds,
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
      toast.success(`Tasks moved to ${data.status}`, {
        description: `${data.count} task${data.count === 1 ? '' : 's'} moved successfully`,
      });
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
          console.error(`Failed to add label to task ${taskId}:`, error);
        } else {
          successCount++;
        }
      }

      return { count: successCount, labelId, taskIds };
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
      if (data.count === 0) return;

      const labelMeta = workspaceLabels.find((l) => l.id === data.labelId);
      const labelName = labelMeta?.name || 'Label';
      toast.success('Label added', {
        description: `Added "${labelName}" to ${data.count} task${data.count === 1 ? '' : 's'}`,
      });
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
      for (const taskId of taskIds) {
        const { error } = await supabase
          .from('task_labels')
          .delete()
          .eq('task_id', taskId)
          .eq('label_id', labelId);
        if (error) {
          console.error(`Failed to remove label from task ${taskId}:`, error);
        } else {
          successCount++;
        }
      }
      return { count: successCount, labelId, taskIds };
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
      toast.success('Label removed', {
        description: `Removed "${labelName}" from ${data.count} task${data.count === 1 ? '' : 's'}`,
      });
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
          console.error(`Failed to add project to task ${taskId}:`, error);
        } else {
          successCount++;
        }
      }

      return { count: successCount, projectId, taskIds };
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
      if (data.count === 0) return;

      const projectMeta = workspaceProjects.find(
        (p) => p.id === data.projectId
      );
      const projectName = projectMeta?.name || 'Project';
      toast.success('Project added', {
        description: `Added "${projectName}" to ${data.count} task${data.count === 1 ? '' : 's'}`,
      });
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
      for (const taskId of taskIds) {
        const { error } = await supabase
          .from('task_project_tasks')
          .delete()
          .eq('task_id', taskId)
          .eq('project_id', projectId);
        if (error) {
          console.error(`Failed to remove project from task ${taskId}:`, error);
        } else {
          successCount++;
        }
      }
      return { count: successCount, projectId, taskIds };
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
      toast.success('Project removed', {
        description: `Removed "${projectName}" from ${data.count} task${data.count === 1 ? '' : 's'}`,
      });
    },
  });
}

/**
 * Bulk add assignee mutation
 */
function useBulkAddAssignee(
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
      console.log('🔄 Bulk add assignee mutation called with taskIds:', taskIds);

      // Insert one by one to ensure triggers fire for each task
      // Note: We try all tasks - duplicates are handled gracefully
      let successCount = 0;
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
          console.error(`Failed to add assignee to task ${taskId}:`, error);
        } else {
          successCount++;
        }
      }

      return { count: successCount, assigneeId, taskIds };
    },
    onMutate: async ({ assigneeId, taskIds }) => {
      await queryClient.cancelQueries({ queryKey: ['tasks', boardId] });
      const previousTasks = queryClient.getQueryData(['tasks', boardId]);

      const current = (previousTasks as Task[] | undefined) || [];

      const missingTaskIds = taskIds.filter((id) => {
        const t = current.find((ct) => ct.id === id);
        return !t?.assignees?.some((a) => a.id === assigneeId);
      });

      queryClient.setQueryData(
        ['tasks', boardId],
        (old: Task[] | undefined) => {
          if (!old) return old;
          return old.map((t) => {
            if (!missingTaskIds.includes(t.id)) return t;
            // We don't have full assignee data here, so we'll just add a placeholder
            // The realtime subscription will update it properly
            return {
              ...t,
              assignees: [
                ...(t.assignees || []),
                {
                  id: assigneeId,
                  display_name: 'Loading...',
                  email: '',
                  avatar_url: null,
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
      console.error('Bulk add assignee failed', error);
      toast.error('Failed to add assignee to selected tasks');
    },
    onSuccess: (data) => {
      if (data.count === 0) return;

      toast.success('Assignee added', {
        description: `Added assignee to ${data.count} task${data.count === 1 ? '' : 's'}`,
      });
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
      for (const taskId of taskIds) {
        const { error } = await supabase
          .from('task_assignees')
          .delete()
          .eq('task_id', taskId)
          .eq('user_id', assigneeId);
        if (error) {
          console.error(`Failed to remove assignee from task ${taskId}:`, error);
        } else {
          successCount++;
        }
      }
      return { count: successCount, assigneeId, taskIds };
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
      toast.success('Assignee removed', {
        description: `Removed assignee from ${data.count} task${data.count === 1 ? '' : 's'}`,
      });
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
      for (const taskId of taskIds) {
        const { error } = await supabase
          .from('tasks')
          .update({ deleted_at: new Date().toISOString() })
          .eq('id', taskId);
        if (error) {
          console.error(`Failed to delete task ${taskId}:`, error);
        } else {
          successCount++;
        }
      }
      return { count: successCount, taskIds };
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
      toast.success('Deleted selected tasks');
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
  const dueDateMutation = useBulkUpdateDueDate(queryClient, supabase, boardId);
  const customDueDateMutation = useBulkUpdateCustomDueDate(queryClient, supabase, boardId);
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
    boardId
  );
  const removeAssigneeMutation = useBulkRemoveAssignee(
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
    deleteMutation.isPending;

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
    bulkDeleteTasks: async () => {
      const taskIds = Array.from(selectedTasks);
      if (taskIds.length === 0) return;
      await deleteMutation.mutateAsync({ taskIds });
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
