import { useQueryClient } from '@tanstack/react-query';
import { createClient } from '@tuturuuu/supabase/next/client';
import type { Task } from '@tuturuuu/types/primitives/Task';
import { toast } from '@tuturuuu/ui/hooks/use-toast';
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
}

export function useTaskLabelManagement({
  task,
  boardId,
  workspaceLabels,
  workspaceId,
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
    const active = task.labels?.some((l) => l.id === labelId);

    // Cancel any outgoing refetches
    await queryClient.cancelQueries({ queryKey: ['tasks', boardId] });

    // Snapshot the previous value
    const previousTasks = queryClient.getQueryData(['tasks', boardId]);

    // Find the label details from workspace labels
    const label = workspaceLabels.find((l) => l.id === labelId);

    // Optimistically update the cache
    queryClient.setQueryData(['tasks', boardId], (old: any[] | undefined) => {
      if (!old) return old;
      return old.map((t) => {
        if (t.id === task.id) {
          if (active) {
            // Remove the label
            return {
              ...t,
              labels: t.labels?.filter((l: any) => l.id !== labelId) || [],
            };
          } else {
            // Add the label
            return {
              ...t,
              labels: [
                ...(t.labels || []),
                label || { id: labelId, name: 'Unknown', color: '#3b82f6' },
              ],
            };
          }
        }
        return t;
      });
    });

    try {
      if (active) {
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
      // Success - mark query as needing refetch but don't force it immediately
      queryClient.setQueryData(['tasks', boardId], (old: any[] | undefined) => {
        return old; // Return unchanged to signal success without triggering render
      });
    } catch (e: any) {
      // Rollback on error
      queryClient.setQueryData(['tasks', boardId], previousTasks);
      toast({
        title: 'Label update failed',
        description: e.message || 'Unable to toggle label',
        variant: 'destructive',
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

      // Auto-apply the newly created label to this task
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
          toast({
            title: 'Label created (not applied)',
            description:
              'The label was created but could not be attached to the task. Refresh and try manually.',
            variant: 'destructive',
          });
        }
      } catch (applyErr: any) {
        console.error('Failed to auto-apply new label', applyErr);
      }

      // Reset form and close dialog
      setNewLabelName('');
      setNewLabelColor(NEW_LABEL_COLOR);

      toast({
        title: 'Label created & applied',
        description: `"${newLabel.name}" label created and applied to this task`,
      });

      // Invalidate workspace labels cache so all task cards get the new label
      queryClient.invalidateQueries({
        queryKey: ['workspace-labels', workspaceId],
      });

      return newLabel;
    } catch (e: any) {
      toast({
        title: 'Failed to create label',
        description: e.message || 'Unable to create new label',
        variant: 'destructive',
      });
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
