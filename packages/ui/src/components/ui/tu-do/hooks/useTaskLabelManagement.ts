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
  selectedTasks?: Set<string>; // For bulk operations
  isMultiSelectMode?: boolean;
  onClearSelection?: () => void;
}

export function useTaskLabelManagement({
  task,
  boardId,
  workspaceLabels,
  workspaceId,
  selectedTasks,
  isMultiSelectMode,
  onClearSelection,
}: UseTaskLabelManagementProps) {
  const queryClient = useQueryClient();
  const [labelsSaving, setLabelsSaving] = useState<string | null>(null);
  const [newLabelName, setNewLabelName] = useState('');
  const [newLabelColor, setNewLabelColor] = useState(NEW_LABEL_COLOR);
  const [creatingLabel, setCreatingLabel] = useState(false);

  // Toggle a label for the task (quick labels submenu)
  async function toggleTaskLabel(labelId: string) {
    setLabelsSaving(labelId);
    const supabase = createClient();

    // Check if we're in multi-select mode with multiple tasks selected
    const shouldBulkUpdate =
      isMultiSelectMode &&
      selectedTasks &&
      selectedTasks.size > 1 &&
      selectedTasks.has(task.id);

    const tasksToUpdate = shouldBulkUpdate
      ? Array.from(selectedTasks)
      : [task.id];

    // Cancel any outgoing refetches
    await queryClient.cancelQueries({ queryKey: ['tasks', boardId] });

    // Snapshot the previous value BEFORE optimistic update
    const previousTasks = queryClient.getQueryData(['tasks', boardId]) as
      | Task[]
      | undefined;

    // Determine action: remove if ALL selected tasks have the label, add otherwise
    let active = task.labels?.some((l) => l.id === labelId);

    if (shouldBulkUpdate && previousTasks) {
      const selectedTasksData = previousTasks.filter((t) =>
        selectedTasks?.has(t.id)
      );
      // Only mark as active (to remove) if ALL selected tasks have the label
      active = selectedTasksData.every((t) =>
        t.labels?.some((l) => l.id === labelId)
      );
    }

    // Find the label details from workspace labels
    const label = workspaceLabels.find((l) => l.id === labelId);

    // Pre-calculate which tasks actually need to change
    const tasksNeedingLabel = !active
      ? tasksToUpdate.filter((taskId) => {
          const t = previousTasks?.find((ct) => ct.id === taskId);
          return !t?.labels?.some((l) => l.id === labelId);
        })
      : [];

    const tasksToRemoveFrom = active
      ? tasksToUpdate.filter((taskId) => {
          const t = previousTasks?.find((ct) => ct.id === taskId);
          return t?.labels?.some((l) => l.id === labelId);
        })
      : [];

    // Optimistically update the cache - only update tasks that actually change
    queryClient.setQueryData(['tasks', boardId], (old: any[] | undefined) => {
      if (!old) return old;
      return old.map((t) => {
        if (active && tasksToRemoveFrom.includes(t.id)) {
          // Remove the label
          return {
            ...t,
            labels: t.labels?.filter((l: any) => l.id !== labelId) || [],
          };
        } else if (!active && tasksNeedingLabel.includes(t.id)) {
          // Add the label
          return {
            ...t,
            labels: [
              ...(t.labels || []),
              label || { id: labelId, name: 'Unknown', color: '#3b82f6' },
            ],
          };
        }
        return t;
      });
    });

    try {
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

          // Ignore duplicate key errors
          if (
            error &&
            !String(error.message).toLowerCase().includes('duplicate')
          ) {
            throw error;
          }
        }
      }

      // Invalidate queries to ensure fresh data
      await queryClient.invalidateQueries({ queryKey: ['tasks', boardId] });

      const taskCount = active
        ? tasksToRemoveFrom.length
        : tasksNeedingLabel.length;
      toast.success(active ? 'Label removed' : 'Label added', {
        description: taskCount > 1 ? `${taskCount} tasks updated` : undefined,
      });

      // Clear selection after bulk update
      if (shouldBulkUpdate && onClearSelection) {
        onClearSelection();
      }
    } catch (e: any) {
      // Rollback on error
      queryClient.setQueryData(['tasks', boardId], previousTasks);
      toast.error(e.message || 'Unable to toggle label');
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

        const { error: linkErr } = await supabase
          .from('task_labels')
          .insert({ task_id: task.id, label_id: newLabel.id });
        if (linkErr) {
          // Rollback on error
          queryClient.setQueryData(['tasks', boardId], previousTasks);
          toast.error(
            'The label was created but could not be attached to the task. Refresh and try manually.'
          );
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

      // Invalidate workspace labels cache so all task cards get the new label
      queryClient.invalidateQueries({
        queryKey: ['workspace-labels', workspaceId],
      });

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
