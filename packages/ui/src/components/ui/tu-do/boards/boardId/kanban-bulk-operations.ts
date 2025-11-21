/**
 * Bulk operations for kanban board
 * Handles batch updates for multiple selected tasks with optimistic updates and rollback
 */

import type { QueryClient } from '@tanstack/react-query';
import type { SupabaseClient } from '@tuturuuu/supabase/next/client';
import type { Task } from '@tuturuuu/types/primitives/Task';
import type { TaskList } from '@tuturuuu/types/primitives/TaskList';
import { toast } from '@tuturuuu/ui/sonner';
import type { WorkspaceLabel } from '@tuturuuu/utils/task-helper';

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
 * Public API returned by createBulkOperations factory
 */
export interface BulkOps {
  bulkUpdatePriority: (priority: Task['priority'] | null) => Promise<void>;
  bulkUpdateEstimation: (points: number | null) => Promise<void>;
  bulkUpdateDueDate: (
    preset: 'today' | 'tomorrow' | 'week' | 'clear'
  ) => Promise<void>;
  bulkMoveToStatus: (status: 'done' | 'closed') => Promise<void>;
  bulkAddLabel: (labelId: string) => Promise<void>;
  bulkRemoveLabel: (labelId: string) => Promise<void>;
  bulkAddProject: (projectId: string) => Promise<void>;
  bulkRemoveProject: (projectId: string) => Promise<void>;
  bulkDeleteTasks: () => Promise<void>;
  getListIdByStatus: (status: 'done' | 'closed') => string | null;
}

/**
 * Creates bulk operation functions with necessary dependencies
 * All functions follow the same pattern:
 * 1. Validate selected tasks
 * 2. Apply optimistic update
 * 3. Execute database operation
 * 4. Invalidate queries
 * 5. Rollback on error
 */
export function createBulkOperations(config: BulkOperationsConfig): BulkOps {
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

  /**
   * Apply optimistic update to selected tasks in React Query cache
   */
  const applyOptimistic = (updater: (t: Task) => Task) => {
    queryClient.setQueryData(['tasks', boardId], (old: Task[] | undefined) => {
      if (!old) return old;
      return old.map((t) => (selectedTasks.has(t.id) ? updater(t) : t));
    });
  };

  /**
   * Update priority for all selected tasks
   */
  async function bulkUpdatePriority(priority: Task['priority'] | null) {
    if (selectedTasks.size === 0) return;
    setBulkWorking(true);
    const ids = Array.from(selectedTasks);
    const prev = queryClient.getQueryData(['tasks', boardId]) as
      | Task[]
      | undefined;

    try {
      applyOptimistic((t) => ({ ...t, priority }));
      const { error, count } = await supabase
        .from('tasks')
        .update({ priority }, { count: 'exact' })
        .in('id', ids)
        .select('id'); // Only select id to avoid embedding column
      if (error) throw error;
      console.log(`✅ Updated ${count} tasks with priority: ${priority}`);
      await queryClient.invalidateQueries({ queryKey: ['tasks', boardId] });
    } catch (e) {
      console.error('Bulk priority update failed', e);
      if (prev) queryClient.setQueryData(['tasks', boardId], prev);
      toast.error('Failed to update priority for selected tasks');
    } finally {
      setBulkWorking(false);
    }
  }

  /**
   * Update estimation points for all selected tasks
   */
  async function bulkUpdateEstimation(points: number | null) {
    if (selectedTasks.size === 0) return;
    setBulkWorking(true);
    const ids = Array.from(selectedTasks);
    const prev = queryClient.getQueryData(['tasks', boardId]) as
      | Task[]
      | undefined;

    try {
      applyOptimistic((t) => ({ ...t, estimation_points: points }));
      const { error, count } = await supabase
        .from('tasks')
        .update({ estimation_points: points }, { count: 'exact' })
        .in('id', ids)
        .select('id'); // Only select id to avoid embedding column
      if (error) throw error;
      console.log(`✅ Updated ${count} tasks with estimation: ${points}`);
      await queryClient.invalidateQueries({ queryKey: ['tasks', boardId] });
    } catch (e) {
      console.error('Bulk estimation update failed', e);
      if (prev) queryClient.setQueryData(['tasks', boardId], prev);
      toast.error('Failed to update estimation for selected tasks');
    } finally {
      setBulkWorking(false);
    }
  }

  /**
   * Update due date for all selected tasks with preset options
   */
  async function bulkUpdateDueDate(
    preset: 'today' | 'tomorrow' | 'week' | 'clear'
  ) {
    if (selectedTasks.size === 0) return;
    setBulkWorking(true);
    const ids = Array.from(selectedTasks);
    const prev = queryClient.getQueryData(['tasks', boardId]) as
      | Task[]
      | undefined;

    try {
      let newDate: string | null = null;
      if (preset !== 'clear') {
        const d = new Date();
        if (preset === 'tomorrow') d.setDate(d.getDate() + 1);
        if (preset === 'week') d.setDate(d.getDate() + 7);
        d.setHours(23, 59, 59, 999);
        newDate = d.toISOString();
      }
      const end_date = newDate;
      applyOptimistic((t) => ({ ...t, end_date }));
      const { error, count } = await supabase
        .from('tasks')
        .update({ end_date }, { count: 'exact' })
        .in('id', ids)
        .select('id'); // Only select id to avoid embedding column
      if (error) throw error;
      console.log(`✅ Updated ${count} tasks with due date: ${end_date}`);
      await queryClient.invalidateQueries({ queryKey: ['tasks', boardId] });
    } catch (e) {
      console.error('Bulk due date update failed', e);
      if (prev) queryClient.setQueryData(['tasks', boardId], prev);
      toast.error('Failed to update due date for selected tasks');
    } finally {
      setBulkWorking(false);
    }
  }

  /**
   * Get list ID by its status
   */
  function getListIdByStatus(status: 'done' | 'closed'): string | null {
    const list = columns.find((c) => c.status === status);
    return list ? String(list.id) : null;
  }

  /**
   * Move all selected tasks to a list with specific status
   */
  async function bulkMoveToStatus(status: 'done' | 'closed') {
    if (selectedTasks.size === 0) return;
    const targetListId = getListIdByStatus(status);
    if (!targetListId) return; // silently no-op if list missing
    setBulkWorking(true);
    const ids = Array.from(selectedTasks);
    const prev = queryClient.getQueryData(['tasks', boardId]) as
      | Task[]
      | undefined;

    try {
      applyOptimistic((t) => ({ ...t, list_id: targetListId }));
      const { error, count } = await supabase
        .from('tasks')
        .update({ list_id: targetListId }, { count: 'exact' })
        .in('id', ids)
        .select('id'); // Only select id to avoid embedding column
      if (error) throw error;
      console.log(`✅ Moved ${count} tasks to ${status} list`);
      await queryClient.invalidateQueries({ queryKey: ['tasks', boardId] });
    } catch (e) {
      console.error('Bulk status move failed', e);
      if (prev) queryClient.setQueryData(['tasks', boardId], prev);
      toast.error('Failed to move selected tasks');
    } finally {
      setBulkWorking(false);
    }
  }

  /**
   * Add a label to all selected tasks (avoiding duplicates)
   */
  async function bulkAddLabel(labelId: string) {
    if (selectedTasks.size === 0) return;
    setBulkWorking(true);
    const ids = Array.from(selectedTasks);
    const prev = queryClient.getQueryData(['tasks', boardId]) as
      | Task[]
      | undefined;

    try {
      // Pre-compute tasks missing the label to avoid duplicate inserts
      const current =
        (queryClient.getQueryData(['tasks', boardId]) as Task[] | undefined) ||
        [];
      const labelMeta = workspaceLabels.find((l) => l.id === labelId);
      const missingTaskIds = ids.filter((id) => {
        const t = current.find((ct) => ct.id === id);
        return !t?.labels?.some((l) => l.id === labelId);
      });

      if (missingTaskIds.length === 0) {
        setBulkWorking(false);
        return; // Nothing to add
      }

      applyOptimistic((t) => {
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

      const rows = missingTaskIds.map((taskId) => ({
        task_id: taskId,
        label_id: labelId,
      }));
      const { error } = await supabase
        .from('task_labels')
        .insert(rows, { count: 'exact' });
      if (error && !String(error.message).toLowerCase().includes('duplicate'))
        throw error;
      await queryClient.invalidateQueries({ queryKey: ['tasks', boardId] });
    } catch (e) {
      console.error('Bulk add label failed', e);
      if (prev) queryClient.setQueryData(['tasks', boardId], prev);
      toast.error('Failed to add label to selected tasks');
    } finally {
      setBulkWorking(false);
    }
  }

  /**
   * Remove a label from all selected tasks
   */
  async function bulkRemoveLabel(labelId: string) {
    if (selectedTasks.size === 0) return;
    setBulkWorking(true);
    const ids = Array.from(selectedTasks);
    const prev = queryClient.getQueryData(['tasks', boardId]) as
      | Task[]
      | undefined;

    try {
      applyOptimistic((t) => ({
        ...t,
        labels: (t.labels || []).filter((l) => l.id !== labelId),
      }));
      const { error } = await supabase
        .from('task_labels')
        .delete()
        .in('task_id', ids)
        .eq('label_id', labelId);
      if (error) throw error;
      await queryClient.invalidateQueries({ queryKey: ['tasks', boardId] });
    } catch (e) {
      console.error('Bulk remove label failed', e);
      if (prev) queryClient.setQueryData(['tasks', boardId], prev);
      toast.error('Failed to remove label from selected tasks');
    } finally {
      setBulkWorking(false);
    }
  }

  /**
   * Add a project to all selected tasks (avoiding duplicates)
   */
  async function bulkAddProject(projectId: string) {
    if (selectedTasks.size === 0) return;
    setBulkWorking(true);
    const ids = Array.from(selectedTasks);
    const prev = queryClient.getQueryData(['tasks', boardId]) as
      | Task[]
      | undefined;

    try {
      // Pre-compute tasks missing the project to avoid duplicate inserts
      const current =
        (queryClient.getQueryData(['tasks', boardId]) as Task[] | undefined) ||
        [];
      const projectMeta = workspaceProjects.find((p) => p.id === projectId);
      const missingTaskIds = ids.filter((id) => {
        const t = current.find((ct) => ct.id === id);
        return !t?.projects?.some((p) => p.id === projectId);
      });

      if (missingTaskIds.length === 0) {
        setBulkWorking(false);
        return;
      }

      applyOptimistic((t) => {
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

      const rows = missingTaskIds.map((taskId) => ({
        task_id: taskId,
        project_id: projectId,
      }));
      const { error } = await supabase
        .from('task_project_tasks')
        .insert(rows, { count: 'exact' });
      if (error && !String(error.message).toLowerCase().includes('duplicate'))
        throw error;
      await queryClient.invalidateQueries({ queryKey: ['tasks', boardId] });
    } catch (e) {
      console.error('Bulk add project failed', e);
      if (prev) queryClient.setQueryData(['tasks', boardId], prev);
      toast.error('Failed to add project to selected tasks');
    } finally {
      setBulkWorking(false);
    }
  }

  /**
   * Remove a project from all selected tasks
   */
  async function bulkRemoveProject(projectId: string) {
    if (selectedTasks.size === 0) return;
    setBulkWorking(true);
    const ids = Array.from(selectedTasks);
    const prev = queryClient.getQueryData(['tasks', boardId]) as
      | Task[]
      | undefined;

    try {
      applyOptimistic((t) => ({
        ...t,
        projects: (t.projects || []).filter((p) => p.id !== projectId),
      }));
      const { error } = await supabase
        .from('task_project_tasks')
        .delete()
        .in('task_id', ids)
        .eq('project_id', projectId);
      if (error) throw error;
      await queryClient.invalidateQueries({ queryKey: ['tasks', boardId] });
    } catch (e) {
      console.error('Bulk remove project failed', e);
      if (prev) queryClient.setQueryData(['tasks', boardId], prev);
      toast.error('Failed to remove project from selected tasks');
    } finally {
      setBulkWorking(false);
    }
  }

  /**
   * Soft-delete all selected tasks (sets deleted flag)
   */
  async function bulkDeleteTasks() {
    if (selectedTasks.size === 0) return;
    setBulkWorking(true);
    const ids = Array.from(selectedTasks);
    const prev = queryClient.getQueryData(['tasks', boardId]) as
      | Task[]
      | undefined;

    try {
      // Optimistically remove from cache
      if (prev) {
        queryClient.setQueryData(
          ['tasks', boardId],
          prev.filter((t) => !ids.includes(t.id))
        );
      }
      const { error, count } = await supabase
        .from('tasks')
        .update({ deleted: true }, { count: 'exact' })
        .in('id', ids)
        .select('id'); // Only select id to avoid embedding column
      if (error) throw error;
      console.log(`✅ Deleted ${count} tasks`);
      await queryClient.invalidateQueries({ queryKey: ['tasks', boardId] });
      clearSelection();
      setBulkDeleteOpen(false);
      toast.success('Deleted selected tasks');
    } catch (e) {
      console.error('Bulk delete failed', e);
      if (prev) queryClient.setQueryData(['tasks', boardId], prev);
      toast.error('Failed to delete selected tasks');
    } finally {
      setBulkWorking(false);
    }
  }

  return {
    bulkUpdatePriority,
    bulkUpdateEstimation,
    bulkUpdateDueDate,
    bulkMoveToStatus,
    bulkAddLabel,
    bulkRemoveLabel,
    bulkAddProject,
    bulkRemoveProject,
    bulkDeleteTasks,
    getListIdByStatus,
  };
}
