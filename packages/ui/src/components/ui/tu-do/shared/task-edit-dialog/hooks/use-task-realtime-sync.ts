import type { JSONContent } from '@tiptap/react';
import { getWorkspaceTask } from '@tuturuuu/internal-api/tasks';
import { createClient } from '@tuturuuu/supabase/next/client';
import type { Task } from '@tuturuuu/types/primitives/Task';
import { useEffect, useRef } from 'react';
import type { WorkspaceTaskLabel } from '../types';
import { getDescriptionContent } from '../utils';

export interface UseTaskRealtimeSyncProps {
  wsId: string;
  taskWorkspaceId?: string;
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
  wsId,
  taskWorkspaceId,
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

  // biome-ignore lint/correctness/useExhaustiveDependencies: pendingNameRef is intentionally read via ref — including .current causes subscription churn on every debounced name change
  useEffect(() => {
    // Only subscribe in edit mode when dialog is open and we have a task ID
    if (isCreateMode || !isOpen || !taskId || disabled) return;

    console.log('🔄 Setting up realtime subscription for task:', taskId);

    const fetchTaskRelations = async () => {
      try {
        const routeTask = await getWorkspaceTask(
          taskWorkspaceId ?? wsId,
          taskId
        );

        const relationshipProjectIds =
          routeTask.task.project_ids ??
          routeTask.task.projects?.map((project) => project.id) ??
          [];

        const filteredProjects = (routeTask.task.projects ?? []).filter(
          (project) => relationshipProjectIds.includes(project.id)
        );

        return {
          labels: routeTask.task.labels ?? [],
          assignees: routeTask.task.assignees ?? [],
          projects: filteredProjects,
        };
      } catch (error: any) {
        console.error('Failed to fetch task relations:', {
          error,
          message: error?.message,
          details: error?.details,
          hint: error?.hint,
        });
        return {
          labels: [],
          assignees: [],
          projects: [],
        };
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
            console.log('Updating task name from realtime:', updatedTask.name);
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
            console.log('Updating start date from realtime:', updatedStartDate);
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
          const relations = await fetchTaskRelations();
          console.log('Updating labels from realtime:', relations.labels);
          setSelectedLabels(relations.labels);
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
          const relations = await fetchTaskRelations();
          console.log('Updating assignees from realtime:', relations.assignees);
          setSelectedAssignees(relations.assignees);
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
          const relations = await fetchTaskRelations();
          console.log('Updating projects from realtime:', relations.projects);
          setSelectedProjects(relations.projects);
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
    // pendingNameRef is a ref — read inside the callback, NOT in the dep array.
    // Including .current would tear down/recreate the subscription on every
    // debounced name change, causing missed realtime events.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    isCreateMode,
    isOpen,
    taskId,
    wsId,
    taskWorkspaceId,
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
