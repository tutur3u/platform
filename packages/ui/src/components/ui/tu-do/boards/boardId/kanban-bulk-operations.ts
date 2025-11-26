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
  boardId: string,
  selectedTasks: Set<string>
) {
  return useMutation({
    mutationFn: async (priority: Task['priority'] | null) => {
      const ids = Array.from(selectedTasks);
      const { error, count } = await supabase
        .from('tasks')
        .update({ priority }, { count: 'exact' })
        .in('id', ids)
        .select('id');
      if (error) throw error;
      return { count, priority };
    },
    onMutate: async (priority) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: ['tasks', boardId] });

      // Snapshot previous state
      const previousTasks = queryClient.getQueryData(['tasks', boardId]);

      // Optimistic update
      queryClient.setQueryData(
        ['tasks', boardId],
        (old: Task[] | undefined) => {
          if (!old) return old;
          return old.map((t) =>
            selectedTasks.has(t.id) ? { ...t, priority } : t
          );
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
  boardId: string,
  selectedTasks: Set<string>
) {
  return useMutation({
    mutationFn: async (points: number | null) => {
      const ids = Array.from(selectedTasks);
      const { error, count } = await supabase
        .from('tasks')
        .update({ estimation_points: points }, { count: 'exact' })
        .in('id', ids)
        .select('id');
      if (error) throw error;
      return { count, points };
    },
    onMutate: async (points) => {
      await queryClient.cancelQueries({ queryKey: ['tasks', boardId] });
      const previousTasks = queryClient.getQueryData(['tasks', boardId]);

      queryClient.setQueryData(
        ['tasks', boardId],
        (old: Task[] | undefined) => {
          if (!old) return old;
          return old.map((t) =>
            selectedTasks.has(t.id) ? { ...t, estimation_points: points } : t
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
  boardId: string,
  selectedTasks: Set<string>
) {
  return useMutation({
    mutationFn: async (preset: 'today' | 'tomorrow' | 'week' | 'clear') => {
      let newDate: string | null = null;
      if (preset !== 'clear') {
        const d = new Date();
        if (preset === 'tomorrow') d.setDate(d.getDate() + 1);
        if (preset === 'week') d.setDate(d.getDate() + 7);
        d.setHours(23, 59, 59, 999);
        newDate = d.toISOString();
      }

      const ids = Array.from(selectedTasks);
      const { error, count } = await supabase
        .from('tasks')
        .update({ end_date: newDate }, { count: 'exact' })
        .in('id', ids)
        .select('id');
      if (error) throw error;
      return { count, end_date: newDate };
    },
    onMutate: async (preset) => {
      await queryClient.cancelQueries({ queryKey: ['tasks', boardId] });
      const previousTasks = queryClient.getQueryData(['tasks', boardId]);

      let newDate: string | null = null;
      if (preset !== 'clear') {
        const d = new Date();
        if (preset === 'tomorrow') d.setDate(d.getDate() + 1);
        if (preset === 'week') d.setDate(d.getDate() + 7);
        d.setHours(23, 59, 59, 999);
        newDate = d.toISOString();
      }

      queryClient.setQueryData(
        ['tasks', boardId],
        (old: Task[] | undefined) => {
          if (!old) return old;
          return old.map((t) =>
            selectedTasks.has(t.id) ? { ...t, end_date: newDate } : t
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
 * Bulk move to status mutation
 */
function useBulkMoveToStatus(
  queryClient: QueryClient,
  supabase: SupabaseClient,
  boardId: string,
  selectedTasks: Set<string>,
  columns: TaskList[]
) {
  return useMutation({
    mutationFn: async (status: 'done' | 'closed') => {
      const targetList = columns.find((c) => c.status === status);
      if (!targetList) throw new Error(`No ${status} list found`);

      const ids = Array.from(selectedTasks);
      const { error, count } = await supabase
        .from('tasks')
        .update({ list_id: targetList.id }, { count: 'exact' })
        .in('id', ids)
        .select('id');
      if (error) throw error;
      return { count, status, targetListId: targetList.id };
    },
    onMutate: async (status) => {
      await queryClient.cancelQueries({ queryKey: ['tasks', boardId] });
      const previousTasks = queryClient.getQueryData(['tasks', boardId]);

      const targetList = columns.find((c) => c.status === status);
      if (!targetList) return { previousTasks };

      queryClient.setQueryData(
        ['tasks', boardId],
        (old: Task[] | undefined) => {
          if (!old) return old;
          return old.map((t) =>
            selectedTasks.has(t.id) ? { ...t, list_id: targetList.id } : t
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
  selectedTasks: Set<string>,
  workspaceLabels: WorkspaceLabel[]
) {
  return useMutation({
    mutationFn: async (labelId: string) => {
      const ids = Array.from(selectedTasks);
      const current =
        (queryClient.getQueryData(['tasks', boardId]) as Task[] | undefined) ||
        [];

      // Only add to tasks that don't have the label
      const missingTaskIds = ids.filter((id) => {
        const t = current.find((ct) => ct.id === id);
        return !t?.labels?.some((l) => l.id === labelId);
      });

      if (missingTaskIds.length === 0) {
        return { count: 0, labelId };
      }

      const rows = missingTaskIds.map((taskId) => ({
        task_id: taskId,
        label_id: labelId,
      }));

      const { error } = await supabase.from('task_labels').insert(rows);
      if (error && !String(error.message).toLowerCase().includes('duplicate')) {
        throw error;
      }

      return { count: missingTaskIds.length, labelId, missingTaskIds };
    },
    onMutate: async (labelId) => {
      await queryClient.cancelQueries({ queryKey: ['tasks', boardId] });
      const previousTasks = queryClient.getQueryData(['tasks', boardId]);

      const current = (previousTasks as Task[] | undefined) || [];
      const labelMeta = workspaceLabels.find((l) => l.id === labelId);
      const ids = Array.from(selectedTasks);

      const missingTaskIds = ids.filter((id) => {
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
  selectedTasks: Set<string>,
  workspaceLabels: WorkspaceLabel[]
) {
  return useMutation({
    mutationFn: async (labelId: string) => {
      const ids = Array.from(selectedTasks);
      const { error } = await supabase
        .from('task_labels')
        .delete()
        .in('task_id', ids)
        .eq('label_id', labelId);
      if (error) throw error;
      return { count: ids.length, labelId };
    },
    onMutate: async (labelId) => {
      await queryClient.cancelQueries({ queryKey: ['tasks', boardId] });
      const previousTasks = queryClient.getQueryData(['tasks', boardId]);

      queryClient.setQueryData(
        ['tasks', boardId],
        (old: Task[] | undefined) => {
          if (!old) return old;
          return old.map((t) =>
            selectedTasks.has(t.id)
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
  selectedTasks: Set<string>,
  workspaceProjects: WorkspaceProject[]
) {
  return useMutation({
    mutationFn: async (projectId: string) => {
      const ids = Array.from(selectedTasks);
      const current =
        (queryClient.getQueryData(['tasks', boardId]) as Task[] | undefined) ||
        [];

      // Only add to tasks that don't have the project
      const missingTaskIds = ids.filter((id) => {
        const t = current.find((ct) => ct.id === id);
        return !t?.projects?.some((p) => p.id === projectId);
      });

      if (missingTaskIds.length === 0) {
        return { count: 0, projectId };
      }

      const rows = missingTaskIds.map((taskId) => ({
        task_id: taskId,
        project_id: projectId,
      }));

      const { error } = await supabase.from('task_project_tasks').insert(rows);
      if (error && !String(error.message).toLowerCase().includes('duplicate')) {
        throw error;
      }

      return { count: missingTaskIds.length, projectId, missingTaskIds };
    },
    onMutate: async (projectId) => {
      await queryClient.cancelQueries({ queryKey: ['tasks', boardId] });
      const previousTasks = queryClient.getQueryData(['tasks', boardId]);

      const current = (previousTasks as Task[] | undefined) || [];
      const projectMeta = workspaceProjects.find((p) => p.id === projectId);
      const ids = Array.from(selectedTasks);

      const missingTaskIds = ids.filter((id) => {
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
  selectedTasks: Set<string>,
  workspaceProjects: WorkspaceProject[]
) {
  return useMutation({
    mutationFn: async (projectId: string) => {
      const ids = Array.from(selectedTasks);
      const { error } = await supabase
        .from('task_project_tasks')
        .delete()
        .in('task_id', ids)
        .eq('project_id', projectId);
      if (error) throw error;
      return { count: ids.length, projectId };
    },
    onMutate: async (projectId) => {
      await queryClient.cancelQueries({ queryKey: ['tasks', boardId] });
      const previousTasks = queryClient.getQueryData(['tasks', boardId]);

      queryClient.setQueryData(
        ['tasks', boardId],
        (old: Task[] | undefined) => {
          if (!old) return old;
          return old.map((t) =>
            selectedTasks.has(t.id)
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
 * Bulk delete tasks mutation
 */
function useBulkDeleteTasks(
  queryClient: QueryClient,
  supabase: SupabaseClient,
  boardId: string,
  selectedTasks: Set<string>,
  clearSelection: () => void,
  setBulkDeleteOpen: (open: boolean) => void
) {
  return useMutation({
    mutationFn: async () => {
      const ids = Array.from(selectedTasks);
      const { error, count } = await supabase
        .from('tasks')
        .update({ deleted: true }, { count: 'exact' })
        .in('id', ids)
        .select('id');
      if (error) throw error;
      return { count };
    },
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: ['tasks', boardId] });
      const previousTasks = queryClient.getQueryData(['tasks', boardId]);

      // Optimistically remove from cache
      queryClient.setQueryData(
        ['tasks', boardId],
        (old: Task[] | undefined) => {
          if (!old) return old;
          return old.filter((t) => !selectedTasks.has(t.id));
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

  // Create all mutations
  const priorityMutation = useBulkUpdatePriority(
    queryClient,
    supabase,
    boardId,
    selectedTasks
  );
  const estimationMutation = useBulkUpdateEstimation(
    queryClient,
    supabase,
    boardId,
    selectedTasks
  );
  const dueDateMutation = useBulkUpdateDueDate(
    queryClient,
    supabase,
    boardId,
    selectedTasks
  );
  const statusMutation = useBulkMoveToStatus(
    queryClient,
    supabase,
    boardId,
    selectedTasks,
    columns
  );
  const addLabelMutation = useBulkAddLabel(
    queryClient,
    supabase,
    boardId,
    selectedTasks,
    workspaceLabels
  );
  const removeLabelMutation = useBulkRemoveLabel(
    queryClient,
    supabase,
    boardId,
    selectedTasks,
    workspaceLabels
  );
  const addProjectMutation = useBulkAddProject(
    queryClient,
    supabase,
    boardId,
    selectedTasks,
    workspaceProjects
  );
  const removeProjectMutation = useBulkRemoveProject(
    queryClient,
    supabase,
    boardId,
    selectedTasks,
    workspaceProjects
  );
  const deleteMutation = useBulkDeleteTasks(
    queryClient,
    supabase,
    boardId,
    selectedTasks,
    clearSelection,
    setBulkDeleteOpen
  );

  // Track loading state
  const isAnyMutationPending =
    priorityMutation.isPending ||
    estimationMutation.isPending ||
    dueDateMutation.isPending ||
    statusMutation.isPending ||
    addLabelMutation.isPending ||
    removeLabelMutation.isPending ||
    addProjectMutation.isPending ||
    removeProjectMutation.isPending ||
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
  return {
    bulkUpdatePriority: async (priority: Task['priority'] | null) => {
      if (selectedTasks.size === 0) return;
      await priorityMutation.mutateAsync(priority);
    },
    bulkUpdateEstimation: async (points: number | null) => {
      if (selectedTasks.size === 0) return;
      await estimationMutation.mutateAsync(points);
    },
    bulkUpdateDueDate: async (
      preset: 'today' | 'tomorrow' | 'week' | 'clear'
    ) => {
      if (selectedTasks.size === 0) return;
      await dueDateMutation.mutateAsync(preset);
    },
    bulkMoveToStatus: async (status: 'done' | 'closed') => {
      if (selectedTasks.size === 0) return;
      const listId = getListIdByStatus(status);
      if (!listId) return;
      await statusMutation.mutateAsync(status);
    },
    bulkAddLabel: async (labelId: string) => {
      if (selectedTasks.size === 0) return;
      await addLabelMutation.mutateAsync(labelId);
    },
    bulkRemoveLabel: async (labelId: string) => {
      if (selectedTasks.size === 0) return;
      await removeLabelMutation.mutateAsync(labelId);
    },
    bulkAddProject: async (projectId: string) => {
      if (selectedTasks.size === 0) return;
      await addProjectMutation.mutateAsync(projectId);
    },
    bulkRemoveProject: async (projectId: string) => {
      if (selectedTasks.size === 0) return;
      await removeProjectMutation.mutateAsync(projectId);
    },
    bulkDeleteTasks: async () => {
      if (selectedTasks.size === 0) return;
      await deleteMutation.mutateAsync();
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
