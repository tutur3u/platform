import { createClient } from '@tuturuuu/supabase/next/client';
import type { Task } from '@tuturuuu/types/primitives/Task';
import { useEffect } from 'react';
import type { WorkspaceTaskLabel } from '../types';

export interface UseTaskRealtimeSyncProps {
  taskId?: string;
  isCreateMode: boolean;
  isOpen: boolean;
  name: string;
  priority: any;
  startDate: Date | undefined;
  endDate: Date | undefined;
  estimationPoints: number | null | undefined;
  selectedListId?: string;
  pendingNameRef: React.MutableRefObject<string | null>;
  setName: (value: string) => void;
  setPriority: (value: any) => void;
  setStartDate: (value: Date | undefined) => void;
  setEndDate: (value: Date | undefined) => void;
  setEstimationPoints: (value: number | null) => void;
  setSelectedListId: (value: string) => void;
  setSelectedLabels: (
    value:
      | WorkspaceTaskLabel[]
      | ((prev: WorkspaceTaskLabel[]) => WorkspaceTaskLabel[])
  ) => void;
  setSelectedAssignees: (value: any[] | ((prev: any[]) => any[])) => void;
  setSelectedProjects: (value: any[] | ((prev: any[]) => any[])) => void;
}

const supabase = createClient();

/**
 * Custom hook for managing realtime sync of task changes
 * Subscribes to database changes and updates local state accordingly
 * Extracted from task-edit-dialog.tsx to improve maintainability
 */
export function useTaskRealtimeSync({
  taskId,
  isCreateMode,
  isOpen,
  name,
  priority,
  startDate,
  endDate,
  estimationPoints,
  selectedListId,
  pendingNameRef,
  setName,
  setPriority,
  setStartDate,
  setEndDate,
  setEstimationPoints,
  setSelectedListId,
  setSelectedLabels,
  setSelectedAssignees,
  setSelectedProjects,
}: UseTaskRealtimeSyncProps): void {
  useEffect(() => {
    // Only subscribe in edit mode when dialog is open and we have a task ID
    if (isCreateMode || !isOpen || !taskId) return;

    console.log('🔄 Setting up realtime subscription for task:', taskId);

    // Helper function to fetch labels for the task
    const fetchTaskLabels = async () => {
      try {
        const { data: labelLinks, error } = await supabase
          .from('task_labels')
          .select('label_id')
          .eq('task_id', taskId);

        if (error) {
          console.error('Error fetching label links:', error);
          throw error;
        }

        if (!labelLinks || labelLinks.length === 0) {
          console.log('No labels found for task');
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
        console.error('Failed to fetch task labels:', {
          error,
          message: error?.message,
          details: error?.details,
          hint: error?.hint,
        });
        return [];
      }
    };

    // Helper function to fetch assignees for the task
    const fetchTaskAssignees = async () => {
      try {
        const { data: assigneeLinks, error } = await supabase
          .from('task_assignees')
          .select('user_id')
          .eq('task_id', taskId);

        if (error) {
          console.error('Error fetching assignee links:', error);
          throw error;
        }

        if (!assigneeLinks || assigneeLinks.length === 0) {
          console.log('No assignees found for task');
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
        console.error('Failed to fetch task assignees:', {
          error,
          message: error?.message,
          details: error?.details,
          hint: error?.hint,
        });
        return [];
      }
    };

    // Helper function to fetch projects for the task
    const fetchTaskProjects = async () => {
      try {
        const { data: projectLinks, error } = await supabase
          .from('task_project_tasks')
          .select('project_id')
          .eq('task_id', taskId);

        if (error) {
          console.error('Error fetching project links:', error);
          throw error;
        }

        if (!projectLinks || projectLinks.length === 0) {
          console.log('No projects found for task');
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
        console.error('Failed to fetch task projects:', {
          error,
          message: error?.message,
          details: error?.details,
          hint: error?.hint,
        });
        return [];
      }
    };

    // Subscribe to task changes (main task fields)
    const taskChannel = supabase
      .channel(`task-updates-${taskId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'tasks',
          filter: `id=eq.${taskId}`,
        },
        async (payload) => {
          console.log('📥 Received realtime update for task:', payload);
          const updatedTask = payload.new as Task;

          // Update local state with changes from other users
          // Only update if no pending name update (avoid conflicts with debounced saves)
          if (!pendingNameRef.current && updatedTask.name !== name) {
            console.log(
              '📝 Updating task name from realtime:',
              updatedTask.name
            );
            setName(updatedTask.name);
          }

          // Update priority if changed
          if (updatedTask.priority !== priority) {
            console.log(
              '🚩 Updating priority from realtime:',
              updatedTask.priority
            );
            setPriority(updatedTask.priority ?? null);
          }

          // Update start date if changed
          const updatedStartDate = updatedTask.start_date
            ? new Date(updatedTask.start_date)
            : undefined;
          const currentStartDate = startDate?.toISOString();
          const newStartDate = updatedStartDate?.toISOString();
          if (currentStartDate !== newStartDate) {
            console.log(
              '📅 Updating start date from realtime:',
              updatedStartDate
            );
            setStartDate(updatedStartDate);
          }

          // Update end date if changed
          const updatedEndDate = updatedTask.end_date
            ? new Date(updatedTask.end_date)
            : undefined;
          const currentEndDate = endDate?.toISOString();
          const newEndDate = updatedEndDate?.toISOString();
          if (currentEndDate !== newEndDate) {
            console.log('📅 Updating end date from realtime:', updatedEndDate);
            setEndDate(updatedEndDate);
          }

          // Update estimation points if changed
          if (updatedTask.estimation_points !== estimationPoints) {
            console.log(
              '⏱️ Updating estimation points from realtime:',
              updatedTask.estimation_points
            );
            setEstimationPoints(updatedTask.estimation_points ?? null);
          }

          // Update list assignment if changed
          if (updatedTask.list_id !== selectedListId) {
            console.log('📋 Updating list from realtime:', updatedTask.list_id);
            setSelectedListId(updatedTask.list_id);
          }
        }
      )
      .subscribe((status) => {
        console.log('📡 Realtime subscription status (tasks):', status);
      });

    // Subscribe to label changes
    const labelChannel = supabase
      .channel(`task-labels-${taskId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'task_labels',
          filter: `task_id=eq.${taskId}`,
        },
        async () => {
          console.log('📥 Received realtime update for task labels');
          const labels = await fetchTaskLabels();
          console.log('🏷️ Updating labels from realtime:', labels);
          setSelectedLabels(labels);
        }
      )
      .subscribe((status) => {
        console.log('📡 Realtime subscription status (labels):', status);
      });

    // Subscribe to assignee changes
    const assigneeChannel = supabase
      .channel(`task-assignees-${taskId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'task_assignees',
          filter: `task_id=eq.${taskId}`,
        },
        async () => {
          console.log('📥 Received realtime update for task assignees');
          const assignees = await fetchTaskAssignees();
          console.log('👥 Updating assignees from realtime:', assignees);
          setSelectedAssignees(assignees);
        }
      )
      .subscribe((status) => {
        console.log('📡 Realtime subscription status (assignees):', status);
      });

    // Subscribe to project changes
    const projectChannel = supabase
      .channel(`task-projects-${taskId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'task_project_tasks',
          filter: `task_id=eq.${taskId}`,
        },
        async () => {
          console.log('📥 Received realtime update for task projects');
          const projects = await fetchTaskProjects();
          console.log('📦 Updating projects from realtime:', projects);
          setSelectedProjects(projects);
        }
      )
      .subscribe((status) => {
        console.log('📡 Realtime subscription status (projects):', status);
      });

    // Cleanup subscriptions on unmount or when task changes
    return () => {
      console.log('🧹 Cleaning up realtime subscriptions for task:', taskId);
      supabase.removeChannel(taskChannel);
      supabase.removeChannel(labelChannel);
      supabase.removeChannel(assigneeChannel);
      supabase.removeChannel(projectChannel);
    };
  }, [
    isCreateMode,
    isOpen,
    taskId,
    name,
    priority,
    startDate,
    endDate,
    estimationPoints,
    selectedListId,
    pendingNameRef,
    setName,
    setPriority,
    setStartDate,
    setEndDate,
    setEstimationPoints,
    setSelectedListId,
    setSelectedLabels,
    setSelectedAssignees,
    setSelectedProjects,
  ]);
}
