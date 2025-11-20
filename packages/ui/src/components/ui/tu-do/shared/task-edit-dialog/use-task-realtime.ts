import { createClient } from '@tuturuuu/supabase/next/client';
import type { Task } from '@tuturuuu/types/primitives/Task';
import { useEffect, useRef } from 'react';
import type { WorkspaceTaskLabel } from './types';

const supabase = createClient();

interface UseTaskRealtimeProps {
  task?: Task;
  isOpen: boolean;
  isCreateMode: boolean;
  onNameUpdate: (name: string) => void;
  onPriorityUpdate: (priority: any) => void;
  onStartDateUpdate: (date: Date | undefined) => void;
  onEndDateUpdate: (date: Date | undefined) => void;
  onEstimationUpdate: (points: number | null) => void;
  onListUpdate: (listId: string) => void;
  onLabelsUpdate: (labels: WorkspaceTaskLabel[]) => void;
  onAssigneesUpdate: (assignees: any[]) => void;
  onProjectsUpdate: (projects: any[]) => void;
}

export function useTaskRealtime({
  task,
  isOpen,
  isCreateMode,
  onNameUpdate,
  onPriorityUpdate,
  onStartDateUpdate,
  onEndDateUpdate,
  onEstimationUpdate,
  onListUpdate,
  onLabelsUpdate,
  onAssigneesUpdate,
  onProjectsUpdate,
}: UseTaskRealtimeProps) {
  const pendingNameRef = useRef<string | null>(null);

  useEffect(() => {
    // Only subscribe in edit mode when dialog is open and we have a task ID
    if (isCreateMode || !isOpen || !task?.id) return;

    console.log('🔄 Setting up realtime subscription for task:', task.id);

    // Helper function to fetch labels for the task
    const fetchTaskLabels = async () => {
      try {
        const { data: labelLinks, error } = await supabase
          .from('task_labels')
          .select('label_id')
          .eq('task_id', task.id);

        if (error) {
          console.error('Error fetching label links:', error);
          throw error;
        }

        if (!labelLinks || labelLinks.length === 0) {
          return [];
        }

        const labelIds = labelLinks
          .map((l: any) => l.label_id)
          .filter((id: any) => id != null);

        if (labelIds.length === 0) return [];

        const { data: labels, error: labelsError } = await supabase
          .from('workspace_task_labels')
          .select('id, name, color, created_at')
          .in('id', labelIds);

        if (labelsError) {
          console.error('Error fetching label details:', labelsError);
          throw labelsError;
        }

        return labels || [];
      } catch (error: any) {
        console.error('Failed to fetch task labels:', error);
        return [];
      }
    };

    // Helper function to fetch assignees for the task
    const fetchTaskAssignees = async () => {
      try {
        const { data: assigneeLinks, error } = await supabase
          .from('task_assignees')
          .select('user_id')
          .eq('task_id', task.id);

        if (error) {
          console.error('Error fetching assignee links:', error);
          throw error;
        }

        if (!assigneeLinks || assigneeLinks.length === 0) {
          return [];
        }

        const userIds = assigneeLinks
          .map((a: any) => a.user_id)
          .filter((id: any) => id != null);

        if (userIds.length === 0) return [];

        const { data: users, error: usersError } = await supabase
          .from('users')
          .select('id, display_name, avatar_url')
          .in('id', userIds);

        if (usersError) {
          console.error('Error fetching user details:', usersError);
          throw usersError;
        }

        return users || [];
      } catch (error: any) {
        console.error('Failed to fetch task assignees:', error);
        return [];
      }
    };

    // Helper function to fetch projects for the task
    const fetchTaskProjects = async () => {
      try {
        const { data: projectLinks, error } = await supabase
          .from('task_project_tasks')
          .select('project_id')
          .eq('task_id', task.id);

        if (error) {
          console.error('Error fetching project links:', error);
          throw error;
        }

        if (!projectLinks || projectLinks.length === 0) {
          return [];
        }

        const projectIds = projectLinks
          .map((p: any) => p.project_id)
          .filter((id: any) => id != null);

        if (projectIds.length === 0) return [];

        const { data: projects, error: projectsError } = await supabase
          .from('task_projects')
          .select('id, name, status')
          .in('id', projectIds);

        if (projectsError) {
          console.error('Error fetching project details:', projectsError);
          throw projectsError;
        }

        return projects || [];
      } catch (error: any) {
        console.error('Failed to fetch task projects:', error);
        return [];
      }
    };

    // Subscribe to task changes (main task fields)
    const taskChannel = supabase
      .channel(`task-updates-${task.id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'tasks',
          filter: `id=eq.${task.id}`,
        },
        async (payload) => {
          console.log('📥 Received realtime update for task:', payload);
          const updatedTask = payload.new as Task;

          // Update local state with changes from other users
          if (!pendingNameRef.current && updatedTask.name) {
            onNameUpdate(updatedTask.name);
          }

          if (updatedTask.priority !== undefined) {
            onPriorityUpdate(updatedTask.priority);
          }

          if (updatedTask.start_date) {
            onStartDateUpdate(new Date(updatedTask.start_date));
          }

          if (updatedTask.end_date) {
            onEndDateUpdate(new Date(updatedTask.end_date));
          }

          if (updatedTask.estimation_points !== undefined) {
            onEstimationUpdate(updatedTask.estimation_points ?? null);
          }

          if (updatedTask.list_id) {
            onListUpdate(updatedTask.list_id);
          }
        }
      )
      .subscribe((status) => {
        console.log('📡 Realtime subscription status (tasks):', status);
      });

    // Subscribe to label changes
    const labelChannel = supabase
      .channel(`task-labels-${task.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'task_labels',
          filter: `task_id=eq.${task.id}`,
        },
        async () => {
          console.log('📥 Received realtime update for task labels');
          const labels = await fetchTaskLabels();
          onLabelsUpdate(labels);
        }
      )
      .subscribe((status) => {
        console.log('📡 Realtime subscription status (labels):', status);
      });

    // Subscribe to assignee changes
    const assigneeChannel = supabase
      .channel(`task-assignees-${task.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'task_assignees',
          filter: `task_id=eq.${task.id}`,
        },
        async () => {
          console.log('📥 Received realtime update for task assignees');
          const assignees = await fetchTaskAssignees();
          onAssigneesUpdate(assignees);
        }
      )
      .subscribe((status) => {
        console.log('📡 Realtime subscription status (assignees):', status);
      });

    // Subscribe to project changes
    const projectChannel = supabase
      .channel(`task-projects-${task.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'task_project_tasks',
          filter: `task_id=eq.${task.id}`,
        },
        async () => {
          console.log('📥 Received realtime update for task projects');
          const projects = await fetchTaskProjects();
          onProjectsUpdate(projects);
        }
      )
      .subscribe((status) => {
        console.log('📡 Realtime subscription status (projects):', status);
      });

    // Cleanup subscriptions on unmount or when task changes
    return () => {
      console.log('🧹 Cleaning up realtime subscriptions for task:', task.id);
      supabase.removeChannel(taskChannel);
      supabase.removeChannel(labelChannel);
      supabase.removeChannel(assigneeChannel);
      supabase.removeChannel(projectChannel);
    };
  }, [
    isCreateMode,
    isOpen,
    task?.id,
    onNameUpdate,
    onPriorityUpdate,
    onStartDateUpdate,
    onEndDateUpdate,
    onEstimationUpdate,
    onListUpdate,
    onLabelsUpdate,
    onAssigneesUpdate,
    onProjectsUpdate,
  ]);

  return { pendingNameRef };
}
