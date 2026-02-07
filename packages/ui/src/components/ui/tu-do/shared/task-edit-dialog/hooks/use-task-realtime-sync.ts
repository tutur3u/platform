import type { JSONContent } from '@tiptap/react';
import { createClient } from '@tuturuuu/supabase/next/client';
import type { Task } from '@tuturuuu/types/primitives/Task';
import { useEffect, useRef } from 'react';
import type { WorkspaceTaskLabel } from '../types';
import { getDescriptionContent } from '../utils';

export interface UseTaskRealtimeSyncProps {
  taskId?: string;
  isCreateMode: boolean;
  isOpen: boolean;
  name: string;
  description: JSONContent | null;
  priority: any;
  startDate: Date | undefined;
  endDate: Date | undefined;
  estimationPoints: number | null | undefined;
  selectedListId?: string;
  collaborationMode: boolean;
  pendingNameRef: React.MutableRefObject<string | null>;
  setName: (value: string) => void;
  setDescription: React.Dispatch<React.SetStateAction<JSONContent | null>>;
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
  disabled?: boolean;
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
  description,
  priority,
  startDate,
  endDate,
  estimationPoints,
  selectedListId,
  collaborationMode,
  pendingNameRef,
  setName,
  setDescription,
  setPriority,
  setStartDate,
  setEndDate,
  setEstimationPoints,
  setSelectedListId,
  setSelectedLabels,
  setSelectedAssignees,
  setSelectedProjects,
  disabled = false,
}: UseTaskRealtimeSyncProps): void {
  // Use refs to track current state values without triggering effect re-runs
  // This prevents subscription recreation on every state change
  const nameRef = useRef(name);
  const descriptionRef = useRef(description);
  const priorityRef = useRef(priority);
  const startDateRef = useRef(startDate);
  const endDateRef = useRef(endDate);
  const estimationPointsRef = useRef(estimationPoints);
  const selectedListIdRef = useRef(selectedListId);

  // Keep refs in sync with props
  useEffect(() => {
    nameRef.current = name;
  }, [name]);
  useEffect(() => {
    descriptionRef.current = description;
  }, [description]);
  useEffect(() => {
    priorityRef.current = priority;
  }, [priority]);
  useEffect(() => {
    startDateRef.current = startDate;
  }, [startDate]);
  useEffect(() => {
    endDateRef.current = endDate;
  }, [endDate]);
  useEffect(() => {
    estimationPointsRef.current = estimationPoints;
  }, [estimationPoints]);
  useEffect(() => {
    selectedListIdRef.current = selectedListId;
  }, [selectedListId]);

  useEffect(() => {
    // Only subscribe in edit mode when dialog is open and we have a task ID
    if (isCreateMode || !isOpen || !taskId || disabled) return;

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

    // Use a single consolidated channel for all task-related listeners.
    // Supabase supports multiple .on() calls on one channel, reducing
    // connection overhead from 4 subscriptions to 1.
    const channel = supabase
      .channel(`task-sync-${taskId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'tasks',
          filter: `id=eq.${taskId}`,
        },
        async (payload) => {
          console.log('Received realtime update for task:', payload);
          const updatedTask = payload.new as Task;

          // Update local state with changes from other users
          // Only update if no pending name update (avoid conflicts with debounced saves)
          // Use refs to get current values without triggering effect re-runs
          if (!pendingNameRef.current && updatedTask.name !== nameRef.current) {
            console.log(
              'Updating task name from realtime:',
              updatedTask.name
            );
            setName(updatedTask.name);
          }

          // Update description if changed
          // We need to compare stringified versions as descriptions are objects/JSON
          // Only update if we're not in collaboration mode (handled by Yjs)
          if (!collaborationMode) {
            const currentDescStr = JSON.stringify(descriptionRef.current);
            const newDescContent = getDescriptionContent(
              updatedTask.description
            );
            const newDescStr = JSON.stringify(newDescContent);

            if (currentDescStr !== newDescStr) {
              console.log('Updating description from realtime');
              setDescription(newDescContent);
            }
          }

          // Update priority if changed
          if (updatedTask.priority !== priorityRef.current) {
            console.log(
              'Updating priority from realtime:',
              updatedTask.priority
            );
            setPriority(updatedTask.priority ?? null);
          }

          // Update start date if changed
          const updatedStartDate = updatedTask.start_date
            ? new Date(updatedTask.start_date)
            : undefined;
          const currentStartDate = startDateRef.current?.toISOString();
          const newStartDate = updatedStartDate?.toISOString();
          if (currentStartDate !== newStartDate) {
            console.log(
              'Updating start date from realtime:',
              updatedStartDate
            );
            setStartDate(updatedStartDate);
          }

          // Update end date if changed
          const updatedEndDate = updatedTask.end_date
            ? new Date(updatedTask.end_date)
            : undefined;
          const currentEndDate = endDateRef.current?.toISOString();
          const newEndDate = updatedEndDate?.toISOString();
          if (currentEndDate !== newEndDate) {
            console.log('Updating end date from realtime:', updatedEndDate);
            setEndDate(updatedEndDate);
          }

          // Update estimation points if changed
          if (updatedTask.estimation_points !== estimationPointsRef.current) {
            console.log(
              'Updating estimation points from realtime:',
              updatedTask.estimation_points
            );
            setEstimationPoints(updatedTask.estimation_points ?? null);
          }

          // Update list assignment if changed
          if (updatedTask.list_id !== selectedListIdRef.current) {
            console.log('Updating list from realtime:', updatedTask.list_id);
            setSelectedListId(updatedTask.list_id);
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'task_labels',
          filter: `task_id=eq.${taskId}`,
        },
        async () => {
          console.log('Received realtime update for task labels');
          const labels = await fetchTaskLabels();
          console.log('Updating labels from realtime:', labels);
          setSelectedLabels(labels);
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'task_assignees',
          filter: `task_id=eq.${taskId}`,
        },
        async () => {
          console.log('Received realtime update for task assignees');
          const assignees = await fetchTaskAssignees();
          console.log('Updating assignees from realtime:', assignees);
          setSelectedAssignees(assignees);
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'task_project_tasks',
          filter: `task_id=eq.${taskId}`,
        },
        async () => {
          console.log('Received realtime update for task projects');
          const projects = await fetchTaskProjects();
          console.log('Updating projects from realtime:', projects);
          setSelectedProjects(projects);
        }
      )
      .subscribe((status) => {
        console.log('Realtime subscription status (task-sync):', status);
      });

    // Cleanup subscription on unmount or when task changes
    return () => {
      console.log('Cleaning up realtime subscription for task:', taskId);
      supabase.removeChannel(channel);
    };
    // Only depend on values that should trigger subscription recreation
    // State values are accessed via refs to prevent unnecessary re-subscriptions
    // Setters are stable (from useState) and don't need to be in deps
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    isCreateMode,
    isOpen,
    taskId,
    pendingNameRef.current,
    collaborationMode,
    setEndDate,
    setEstimationPoints,
    setName,
    setDescription,
    setPriority,
    setSelectedAssignees,
    setSelectedLabels,
    setSelectedListId,
    setSelectedProjects,
    setStartDate,
    disabled,
  ]);
}
