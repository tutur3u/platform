import { useQueryClient } from '@tanstack/react-query';
import { createClient } from '@tuturuuu/supabase/next/client';
import type { Task } from '@tuturuuu/types/primitives/Task';
import { toast } from '@tuturuuu/ui/sonner';
import { useState } from 'react';

interface TaskProject {
  id: string;
  name: string;
  status: string | null;
}

interface UseTaskProjectManagementProps {
  task: Task;
  boardId: string;
  workspaceProjects: TaskProject[];
}

export function useTaskProjectManagement({
  task,
  boardId,
  workspaceProjects,
}: UseTaskProjectManagementProps) {
  const queryClient = useQueryClient();
  const [projectsSaving, setProjectsSaving] = useState<string | null>(null);

  // Toggle a project for the task (quick projects submenu)
  async function toggleTaskProject(projectId: string) {
    setProjectsSaving(projectId);
    const supabase = createClient();
    const active = task.projects?.some((p) => p.id === projectId);

    // Cancel any outgoing refetches
    await queryClient.cancelQueries({ queryKey: ['tasks', boardId] });

    // Snapshot the previous value
    const previousTasks = queryClient.getQueryData(['tasks', boardId]);

    // Find the project details from workspace projects
    const project = workspaceProjects.find((p) => p.id === projectId);

    // Optimistically update the cache
    queryClient.setQueryData(['tasks', boardId], (old: any[] | undefined) => {
      if (!old) return old;
      return old.map((t) => {
        if (t.id === task.id) {
          if (active) {
            // Remove the project
            return {
              ...t,
              projects:
                t.projects?.filter((p: any) => p.id !== projectId) || [],
            };
          } else {
            // Add the project
            return {
              ...t,
              projects: [
                ...(t.projects || []),
                project || { id: projectId, name: 'Unknown', status: null },
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
          .from('task_project_tasks')
          .delete()
          .eq('task_id', task.id)
          .eq('project_id', projectId);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('task_project_tasks')
          .insert({ task_id: task.id, project_id: projectId });

        // Handle duplicate key error gracefully
        if (error) {
          // Error code 23505 is duplicate key violation in PostgreSQL
          if (error.code === '23505') {
            // Project is already linked - just update cache to reflect reality
            toast.info('This project is already linked to the task');
            // Fetch current state to sync cache
            await queryClient.invalidateQueries({
              queryKey: ['tasks', boardId],
            });
            return;
          }
          throw error;
        }
      }
      // Success - mark query as needing refetch but don't force it immediately
      queryClient.setQueryData(['tasks', boardId], (old: any[] | undefined) => {
        return old; // Return unchanged to signal success without triggering render
      });
    } catch (e: any) {
      // Rollback on error
      queryClient.setQueryData(['tasks', boardId], previousTasks);
      toast.error(e.message || 'Unable to toggle project');
    } finally {
      setProjectsSaving(null);
    }
  }

  return {
    projectsSaving,
    toggleTaskProject,
  };
}
