import { useQueryClient } from '@tanstack/react-query';
import { getWorkspaceTask } from '@tuturuuu/internal-api/tasks';
import type { TaskPriority } from '@tuturuuu/types/primitives/Priority';
import type { Task } from '@tuturuuu/types/primitives/Task';
import { useBoardRealtime } from '@tuturuuu/ui/hooks/useBoardRealtime';
import type { MutableRefObject } from 'react';
import { useCallback, useRef } from 'react';
import type { BoardBroadcastFn } from '../../board-broadcast-context';
import type { WorkspaceTaskLabel } from '../types';

export interface UseTaskRealtimeSyncProps {
  wsId: string;
  taskWorkspaceId?: string;
  taskId?: string;
  boardId: string;
  isCreateMode: boolean;
  isOpen: boolean;
  realtimeEnabled?: boolean;
  isPersonalWorkspace?: boolean;
  name: string;
  priority: TaskPriority | null;
  startDate: Date | undefined;
  endDate: Date | undefined;
  estimationPoints: number | null | undefined;
  selectedListId?: string;
  pendingNameRef: MutableRefObject<string | null>;
  setName: (value: string) => void;
  setPriority: (value: TaskPriority | null) => void;
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

export interface UseTaskRealtimeSyncReturn {
  broadcast: BoardBroadcastFn;
}

const hasOwn = (value: object, key: keyof Task) => Object.hasOwn(value, key);

const toDate = (value: string | null | undefined) =>
  value ? new Date(value) : undefined;

const datesMatch = (
  currentValue: Date | undefined,
  nextValue: Date | undefined
) => currentValue?.toISOString() === nextValue?.toISOString();

/**
 * Keeps an open task dialog in sync with board broadcast events.
 * Task descriptions stay on the Yjs path when realtime is enabled.
 */
export function useTaskRealtimeSync({
  wsId,
  taskWorkspaceId,
  taskId,
  boardId,
  isCreateMode,
  isOpen,
  realtimeEnabled = true,
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
  disabled = false,
}: UseTaskRealtimeSyncProps): UseTaskRealtimeSyncReturn {
  const queryClient = useQueryClient();

  const nameRef = useRef(name);
  const priorityRef = useRef(priority);
  const startDateRef = useRef(startDate);
  const endDateRef = useRef(endDate);
  const estimationPointsRef = useRef(estimationPoints);
  const selectedListIdRef = useRef(selectedListId);
  const taskRequestTokenRef = useRef(0);
  const relationsRequestTokenRef = useRef(0);

  nameRef.current = name;
  priorityRef.current = priority;
  startDateRef.current = startDate;
  endDateRef.current = endDate;
  estimationPointsRef.current = estimationPoints;
  selectedListIdRef.current = selectedListId;

  const realtimeActive =
    !isCreateMode && isOpen && realtimeEnabled && !!taskId && !disabled;

  const fetchLatestTask = useCallback(async () => {
    if (!taskId) return null;

    try {
      const workspaceTaskId = taskWorkspaceId ?? wsId;
      const workspaceTaskQueryKey = [
        'workspaceTask',
        workspaceTaskId,
        taskId,
      ] as const;

      await queryClient.cancelQueries({
        queryKey: workspaceTaskQueryKey,
        exact: true,
      });

      const routeTask = await queryClient.fetchQuery({
        queryKey: workspaceTaskQueryKey,
        queryFn: () => getWorkspaceTask(workspaceTaskId, taskId),
        staleTime: 0,
      });

      return routeTask.task;
    } catch {
      return null;
    }
  }, [queryClient, taskId, taskWorkspaceId, wsId]);

  const applyLatestTaskFields = useCallback(async () => {
    if (!realtimeActive || !taskId) return;

    taskRequestTokenRef.current += 1;
    const token = taskRequestTokenRef.current;
    const task = await fetchLatestTask();

    if (token !== taskRequestTokenRef.current || !task || task.id !== taskId) {
      return;
    }

    if (
      hasOwn(task, 'name') &&
      typeof task.name === 'string' &&
      !pendingNameRef.current &&
      task.name !== nameRef.current
    ) {
      setName(task.name);
    }

    if (hasOwn(task, 'priority') && task.priority !== priorityRef.current) {
      setPriority(task.priority ?? null);
    }

    if (hasOwn(task, 'start_date')) {
      const nextStartDate = toDate(task.start_date);
      if (!datesMatch(startDateRef.current, nextStartDate)) {
        setStartDate(nextStartDate);
      }
    }

    if (hasOwn(task, 'end_date')) {
      const nextEndDate = toDate(task.end_date);
      if (!datesMatch(endDateRef.current, nextEndDate)) {
        setEndDate(nextEndDate);
      }
    }

    if (
      hasOwn(task, 'estimation_points') &&
      task.estimation_points !== estimationPointsRef.current
    ) {
      setEstimationPoints(task.estimation_points ?? null);
    }

    if (
      hasOwn(task, 'list_id') &&
      typeof task.list_id === 'string' &&
      task.list_id !== selectedListIdRef.current
    ) {
      setSelectedListId(task.list_id);
    }
  }, [
    fetchLatestTask,
    pendingNameRef,
    realtimeActive,
    setEndDate,
    setEstimationPoints,
    setName,
    setPriority,
    setSelectedListId,
    setStartDate,
    taskId,
  ]);

  const fetchTaskRelations = useCallback(async () => {
    const task = await fetchLatestTask();

    if (!task) return null;

    const relationshipProjectIds =
      task.project_ids ?? task.projects?.map((project) => project.id) ?? [];

    const filteredProjects = (task.projects ?? []).filter((project) =>
      relationshipProjectIds.includes(project.id)
    );

    return {
      labels: task.labels ?? [],
      assignees: task.assignees ?? [],
      projects: filteredProjects,
    };
  }, [fetchLatestTask]);

  const applyLatestRelations = useCallback(async () => {
    if (!realtimeActive) return;

    relationsRequestTokenRef.current += 1;
    const token = relationsRequestTokenRef.current;
    const relations = await fetchTaskRelations();

    if (token !== relationsRequestTokenRef.current || !relations) return;

    setSelectedLabels(relations.labels);
    setSelectedAssignees(relations.assignees ?? []);
    setSelectedProjects(relations.projects ?? []);
  }, [
    fetchTaskRelations,
    realtimeActive,
    setSelectedAssignees,
    setSelectedLabels,
    setSelectedProjects,
  ]);

  const handleTaskChange = useCallback(
    (updatedTask: Task, eventType: 'INSERT' | 'UPDATE' | 'DELETE') => {
      if (
        !realtimeActive ||
        eventType === 'DELETE' ||
        updatedTask.id !== taskId
      )
        return;

      void applyLatestTaskFields();
    },
    [applyLatestTaskFields, realtimeActive, taskId]
  );

  const handleTaskRelationsChange = useCallback(
    (taskIds: string[]) => {
      if (!realtimeActive || !taskId || !taskIds.includes(taskId)) return;

      void applyLatestRelations();
    },
    [applyLatestRelations, realtimeActive, taskId]
  );

  const { broadcast } = useBoardRealtime(boardId, {
    enabled: realtimeActive,
    onTaskChange: handleTaskChange,
    onTaskRelationsChange: handleTaskRelationsChange,
  });

  return { broadcast };
}
