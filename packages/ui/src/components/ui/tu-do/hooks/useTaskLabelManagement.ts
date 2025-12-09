import { useQueryClient } from '@tanstack/react-query';
import { createClient } from '@tuturuuu/supabase/next/client';
import type { Task } from '@tuturuuu/types/primitives/Task';
import { toast } from '@tuturuuu/ui/sonner';
import { useState } from 'react';
import { NEW_LABEL_COLOR } from '../utils/taskConstants';

interface WorkspaceTaskLabel {
  id: string;
  name: string;
  color: string;
  created_at: string;
}

interface UseTaskLabelManagementProps {
  task: Task;
  boardId: string;
  workspaceLabels: WorkspaceTaskLabel[];
  workspaceId?: string;
  selectedTasks?: Set<string>;
  isMultiSelectMode?: boolean;
  onClearSelection?: () => void;
  taskId?: string; // Optional task ID for syncing individual task cache
}

export function useTaskLabelManagement({
  task,
  boardId,
  workspaceLabels,
  workspaceId,
  selectedTasks,
  isMultiSelectMode,
  taskId,
}: UseTaskLabelManagementProps) {
  const queryClient = useQueryClient();
  const [labelsSaving, setLabelsSaving] = useState<string | null>(null);
  const [newLabelName, setNewLabelName] = useState('');
  const [newLabelColor, setNewLabelColor] = useState(NEW_LABEL_COLOR);
  const [creatingLabel, setCreatingLabel] = useState(false);

  // Toggle a label for the task (quick labels submenu)
  async function toggleTaskLabel(labelId: string) {
    // CRITICAL: Get current task state from cache instead of stale prop
    // This ensures we read the most up-to-date state after optimistic updates
    const currentTask = taskId
      ? (queryClient.getQueryData(['task', taskId]) as Task | undefined) ?? task
      : task;

    // Check if we're in multi-select mode with multiple tasks selected
    const shouldBulkUpdate =
      isMultiSelectMode &&
      selectedTasks &&
      selectedTasks.size > 1 &&
      selectedTasks.has(currentTask.id);

    const tasksToUpdate = shouldBulkUpdate
      ? Array.from(selectedTasks)
      : [currentTask.id];

    setLabelsSaving(labelId);

    // Cancel any outgoing refetches
    await queryClient.cancelQueries({ queryKey: ['tasks', boardId] });

    // Snapshot the previous value BEFORE optimistic update
    const previousTasks = queryClient.getQueryData(['tasks', boardId]) as
      | Task[]
      | undefined;

    // Determine action: remove if ALL selected tasks have the label, add otherwise
    // Use currentTask from cache, not stale task prop
    let active = currentTask.labels?.some((l) => l.id === labelId) ?? false;

    if (shouldBulkUpdate && previousTasks) {
      const selectedTasksData = previousTasks.filter((t) =>
        selectedTasks?.has(t.id)
      );
      // Only mark as active (to remove) if ALL selected tasks have the label
      active = selectedTasksData.every(
        (t) => t.labels?.some((l) => l.id === labelId) ?? false
      );
    }

    // Helper to get task from either board cache or individual cache
    const getTaskState = (taskId: string): Task | undefined => {
      // First try board cache
      const fromBoardCache = previousTasks?.find((ct) => ct.id === taskId);
      if (fromBoardCache) return fromBoardCache;

      // Fallback to individual task cache (for tasks not in board view)
      if (taskId === currentTask.id) return currentTask;

      return undefined;
    };

    // Pre-calculate which tasks actually need to change
    const tasksNeedingLabel = !active
      ? tasksToUpdate.filter((taskId) => {
          const t = getTaskState(taskId);
          return !t?.labels?.some((l) => l.id === labelId);
        })
      : [];

    const tasksToRemoveFrom = active
      ? tasksToUpdate.filter((taskId) => {
          const t = getTaskState(taskId);
          return t?.labels?.some((l) => l.id === labelId);
        })
      : [];

    // Get label details from workspace labels for optimistic update
    const label = workspaceLabels.find((l) => l.id === labelId);

    // Optimistically update the cache - only update tasks that actually change
    queryClient.setQueryData(['tasks', boardId], (old: Task[] | undefined) => {
      if (!old) return old;
      return old.map((t) => {
        if (active && tasksToRemoveFrom.includes(t.id)) {
          // Remove the label
          return {
            ...t,
            labels: t.labels?.filter((l) => l.id !== labelId) || [],
          };
        } else if (!active && tasksNeedingLabel.includes(t.id)) {
          // Add the label
          return {
            ...t,
            labels: [
              ...(t.labels || []),
              label || {
                id: labelId,
                name: 'Unknown',
                color: '#3b82f6',
                created_at: new Date().toISOString(),
              },
            ],
          };
        }
        return t;
      });
    });

    // CRITICAL: Also update the individual task cache if taskId is provided
    // This ensures the chip menu's task cache stays in sync with the board cache
    if (taskId) {
      queryClient.setQueryData(['task', taskId], (old: Task | undefined) => {
        if (!old) return old;
        if (active && tasksToRemoveFrom.includes(taskId)) {
          // Remove the label
          return {
            ...old,
            labels: old.labels?.filter((l) => l.id !== labelId) || [],
          };
        } else if (!active && tasksNeedingLabel.includes(taskId)) {
          // Add the label
          return {
            ...old,
            labels: [
              ...(old.labels || []),
              label || {
                id: labelId,
                name: 'Unknown',
                color: '#3b82f6',
                created_at: new Date().toISOString(),
              },
            ],
          };
        }
        return old;
      });
    }

    try {
      const supabase = createClient();
      if (active) {
        // Remove label only from tasks that have it
        if (tasksToRemoveFrom.length > 0) {
          const { error } = await supabase
            .from('task_labels')
            .delete()
            .in('task_id', tasksToRemoveFrom)
            .eq('label_id', labelId);
          if (error) throw error;
        }
      } else {
        // Add label to selected tasks that don't already have it
        if (tasksNeedingLabel.length > 0) {
          const rows = tasksNeedingLabel.map((taskId) => ({
            task_id: taskId,
            label_id: labelId,
          }));
          const { error } = await supabase.from('task_labels').insert(rows);

          // Ignore duplicate key errors (code '23505' for unique_violation)
          if (error && error.code !== '23505') {
            throw error;
          }
        }
      }

      const taskCount = active
        ? tasksToRemoveFrom.length
        : tasksNeedingLabel.length;
      toast.success(active ? 'Label removed' : 'Label added', {
        description: taskCount > 1 ? `${taskCount} tasks updated` : undefined,
      });

      // Don't auto-clear selection - let user manually clear with "Clear" button
    } catch (e: any) {
      // Rollback on error
      if (previousTasks) {
        queryClient.setQueryData(['tasks', boardId], previousTasks);
      }
      console.error('Failed to toggle label:', e);
      toast.error('Error', {
        description: 'Failed to update label. Please try again.',
      });
    } finally {
      setLabelsSaving(null);
    }
  }

  // Create a new label
  async function createNewLabel() {
    if (!newLabelName.trim() || !workspaceId) return;

    setCreatingLabel(true);
    try {
      const response = await fetch(`/api/v1/workspaces/${workspaceId}/labels`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: newLabelName.trim(),
          color: newLabelColor,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to create label');
      }

      const newLabel = await response.json();

      // Optimistically add the new label to ALL workspace labels caches
      // Note: Two different query keys are used across the codebase
      queryClient.setQueryData(
        ['workspace-labels', workspaceId],
        (old: WorkspaceTaskLabel[] | undefined) => {
          if (!old) return [newLabel];
          // Check if label already exists (shouldn't happen, but defensive)
          if (old.some((l) => l.id === newLabel.id)) return old;
          // Sort alphabetically like useWorkspaceLabels does
          const updated = [newLabel, ...old];
          return updated.sort((a, b) =>
            a.name.toLowerCase().localeCompare(b.name.toLowerCase())
          );
        }
      );
      queryClient.setQueryData(
        ['workspace_task_labels', workspaceId],
        (old: WorkspaceTaskLabel[] | undefined) => {
          if (!old) return [newLabel];
          if (old.some((l) => l.id === newLabel.id)) return old;
          return [newLabel, ...old]; // Most recent first (created_at desc)
        }
      );

      // Auto-apply the newly created label to this task
      let linkSucceeded = false;
      try {
        const supabase = createClient();

        // Cancel any outgoing refetches
        await queryClient.cancelQueries({ queryKey: ['tasks', boardId] });

        // Snapshot the previous value
        const previousTasks = queryClient.getQueryData(['tasks', boardId]);

        // Optimistically update the cache
        queryClient.setQueryData(
          ['tasks', boardId],
          (old: any[] | undefined) => {
            if (!old) return old;
            return old.map((t) => {
              if (t.id === task.id) {
                return {
                  ...t,
                  labels: [...(t.labels || []), newLabel],
                };
              }
              return t;
            });
          }
        );

        // CRITICAL: Also update individual task cache if taskId is provided
        if (taskId) {
          queryClient.setQueryData(['task', taskId], (old: Task | undefined) => {
            if (!old) return old;
            return {
              ...old,
              labels: [...(old.labels || []), newLabel],
            };
          });
        }

        const { error: linkErr } = await supabase
          .from('task_labels')
          .insert({ task_id: task.id, label_id: newLabel.id });
        if (linkErr) {
          // Check error code first for proper duplicate detection
          if (
            linkErr.code === '23505' ||
            (!linkErr.code &&
              String(linkErr.message).toLowerCase().includes('duplicate'))
          ) {
            // Treat duplicates as success - label already exists on task
            linkSucceeded = true;
          } else {
            // Rollback on other errors
            queryClient.setQueryData(['tasks', boardId], previousTasks);
            toast.error(
              'The label was created but could not be attached to the task. Refresh and try manually.'
            );
          }
        } else {
          linkSucceeded = true;
        }
      } catch (applyErr: any) {
        console.error('Failed to auto-apply new label', applyErr);
      }

      // Only show success toast and reset form if link succeeded
      if (linkSucceeded) {
        // Reset form and close dialog
        setNewLabelName('');
        setNewLabelColor(NEW_LABEL_COLOR);

        toast.success(
          `"${newLabel.name}" label created and applied to this task`
        );
      }

      // ✅ NO invalidation - workspace labels cache already updated optimistically above

      return newLabel;
    } catch (e: any) {
      toast.error(e.message || 'Unable to create new label');
      throw e;
    } finally {
      setCreatingLabel(false);
    }
  }

  return {
    labelsSaving,
    newLabelName,
    setNewLabelName,
    newLabelColor,
    setNewLabelColor,
    creatingLabel,
    toggleTaskLabel,
    createNewLabel,
  };
}
