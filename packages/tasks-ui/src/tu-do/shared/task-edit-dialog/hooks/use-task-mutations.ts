import { useQueryClient } from '@tanstack/react-query';
import {
  type TaskSchedulingUpdatePayload,
  updateCurrentUserTaskSchedulingSettings,
} from '@tuturuuu/internal-api';
import type { TaskPriority } from '@tuturuuu/types/primitives/Priority';
import type { CalendarHoursType, Task } from '@tuturuuu/types/primitives/Task';
import { useToast } from '@tuturuuu/ui/hooks/use-toast';
import { isPersonalExternalOverlayTask } from '@tuturuuu/ui/lib/task-personal-external';
import { useCallback, useState } from 'react';
import {
  type BoardBroadcastFn,
  getActiveBroadcast,
  useBoardBroadcast,
} from '../../board-broadcast-context';
import {
  patchTaskInVisibleCaches,
  restoreVisibleTaskCaches,
  snapshotVisibleTaskCaches,
} from '../../task-cache-patches';
import { updateWorkspaceTask } from './task-api';

export interface SchedulingSettings {
  totalDuration: number | null;
  isSplittable: boolean;
  minSplitDurationMinutes: number | null;
  maxSplitDurationMinutes: number | null;
  calendarHours: CalendarHoursType | null;
  autoSchedule: boolean;
}

export interface UseTaskMutationsProps {
  wsId: string;
  taskId?: string;
  isCreateMode: boolean;
  boardId: string;
  visibleBoardId?: string;
  visibleTaskSnapshot?: Partial<Task>;
  estimationPoints: number | null;
  priority: TaskPriority | null;
  selectedListId?: string;
  taskName?: string;
  setEstimationPoints: (value: number | null) => void;
  setPriority: (value: TaskPriority | null) => void;
  setStartDate: (value: Date | undefined) => void;
  setEndDate: (value: Date | undefined) => void;
  setSelectedListId: (value: string) => void;
  fallbackBroadcast?: BoardBroadcastFn | null;
  onUpdate: () => void;
}

export interface SaveSchedulingSettingsOptions {
  silent?: boolean;
  skipRefresh?: boolean;
}

export interface UseTaskMutationsReturn {
  updateEstimation: (points: number | null) => Promise<void>;
  updatePriority: (newPriority: TaskPriority | null) => Promise<void>;
  updateStartDate: (newDate: Date | undefined) => Promise<void>;
  updateEndDate: (newDate: Date | undefined) => Promise<void>;
  updateList: (newListId: string) => Promise<void>;
  saveNameToDatabase: (newName: string) => Promise<void>;
  saveSchedulingSettings: (
    settings: SchedulingSettings,
    options?: SaveSchedulingSettingsOptions
  ) => Promise<boolean>;
  estimationSaving: boolean;
  schedulingSaving: boolean;
}

type PropertyPatch = Pick<
  Partial<Task>,
  'name' | 'priority' | 'start_date' | 'end_date' | 'estimation_points'
>;

function hasPersonalExternalVisibleContext({
  boardId,
  visibleBoardId,
  visibleTaskSnapshot,
}: {
  boardId: string;
  visibleBoardId?: string;
  visibleTaskSnapshot?: Partial<Task>;
}) {
  return Boolean(
    visibleBoardId &&
      visibleBoardId !== boardId &&
      isPersonalExternalOverlayTask(visibleTaskSnapshot as Task | undefined)
  );
}

/**
 * Custom hook for task database mutations (CRUD operations on task properties)
 * Extracted from task-edit-dialog.tsx to improve maintainability
 */
export function useTaskMutations({
  wsId,
  taskId,
  isCreateMode,
  boardId,
  visibleBoardId,
  visibleTaskSnapshot,
  estimationPoints,
  priority,
  selectedListId,
  taskName,
  setEstimationPoints,
  setPriority,
  setStartDate,
  setEndDate,
  setSelectedListId,
  fallbackBroadcast,
  onUpdate,
}: UseTaskMutationsProps): UseTaskMutationsReturn {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const contextBroadcast = useBoardBroadcast();
  const broadcast =
    contextBroadcast ?? getActiveBroadcast() ?? fallbackBroadcast;
  const [estimationSaving, setEstimationSaving] = useState(false);
  const [schedulingSaving, setSchedulingSaving] = useState(false);
  const hasPersonalExternalContext = hasPersonalExternalVisibleContext({
    boardId,
    visibleBoardId,
    visibleTaskSnapshot,
  });
  const propertyCacheBoardId =
    hasPersonalExternalContext && visibleBoardId ? visibleBoardId : boardId;

  // Helper to trigger refresh after successful mutations
  // Note: The kanban board uses realtime subscriptions directly and doesn't
  // register a refresh callback via the task dialog system, so calling onUpdate
  // here won't conflict with realtime sync on the board page.
  // Also invalidate task-history so the activity section updates immediately.
  const triggerRefresh = useCallback(
    (options?: { refreshBoard?: boolean }) => {
      const refreshBoard = options?.refreshBoard ?? true;

      queryClient.invalidateQueries({ queryKey: ['task-history'] });
      if (refreshBoard) {
        onUpdate();
      }
    },
    [queryClient, onUpdate]
  );

  const patchPropertyInVisibleCaches = useCallback(
    (patch: PropertyPatch) => {
      if (!taskId) return;

      patchTaskInVisibleCaches({
        queryClient,
        boardId: propertyCacheBoardId,
        taskId,
        updater: (task) => ({
          ...task,
          ...patch,
          ...(hasPersonalExternalContext
            ? { _localMutationAt: Date.now() }
            : {}),
        }),
      });
    },
    [hasPersonalExternalContext, propertyCacheBoardId, queryClient, taskId]
  );

  const triggerPropertyRefresh = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['task-history'] });
    if (!hasPersonalExternalContext) {
      onUpdate();
    }
  }, [hasPersonalExternalContext, queryClient, onUpdate]);

  const updateEstimation = useCallback(
    async (points: number | null) => {
      if (points === estimationPoints) return;
      setEstimationPoints(points);
      if (isCreateMode || !taskId || taskId === 'new') {
        return;
      }
      setEstimationSaving(true);
      const cacheSnapshot = snapshotVisibleTaskCaches(
        queryClient,
        propertyCacheBoardId,
        [taskId]
      );

      // Optimistic update - prevents flicker by updating cache immediately
      patchPropertyInVisibleCaches({ estimation_points: points });

      try {
        const { task } = await updateWorkspaceTask(wsId, taskId, {
          estimation_points: points,
        });
        const updatedEstimationPoints = task.estimation_points ?? points;
        patchPropertyInVisibleCaches({
          estimation_points: updatedEstimationPoints,
        });
        broadcast?.('task:upsert', {
          task: {
            id: taskId,
            estimation_points: updatedEstimationPoints,
          },
        });
        triggerPropertyRefresh();
      } catch (e: any) {
        console.error('Failed updating estimation', e);
        // Revert optimistic update on error
        restoreVisibleTaskCaches(queryClient, cacheSnapshot);
        toast({
          title: 'Failed to update estimation',
          description: e.message || 'Please try again',
          variant: 'destructive',
        });
      } finally {
        setEstimationSaving(false);
      }
    },
    [
      estimationPoints,
      isCreateMode,
      wsId,
      taskId,
      queryClient,
      propertyCacheBoardId,
      toast,
      setEstimationPoints,
      patchPropertyInVisibleCaches,
      triggerPropertyRefresh,
      broadcast,
    ]
  );

  const updatePriority = useCallback(
    async (newPriority: TaskPriority | null) => {
      if (newPriority === priority) return;
      setPriority(newPriority);
      if (isCreateMode || !taskId || taskId === 'new') {
        return;
      }
      const cacheSnapshot = snapshotVisibleTaskCaches(
        queryClient,
        propertyCacheBoardId,
        [taskId]
      );

      // Optimistic update - prevents flicker
      patchPropertyInVisibleCaches({ priority: newPriority });

      try {
        const { task } = await updateWorkspaceTask(wsId, taskId, {
          priority: newPriority,
        });
        const updatedPriority = task.priority ?? newPriority;
        patchPropertyInVisibleCaches({ priority: updatedPriority });
        broadcast?.('task:upsert', {
          task: {
            id: taskId,
            priority: updatedPriority,
          },
        });
        triggerPropertyRefresh();
      } catch (e: any) {
        console.error('Failed updating priority', e);
        // Revert optimistic update on error
        restoreVisibleTaskCaches(queryClient, cacheSnapshot);
        toast({
          title: 'Failed to update priority',
          description: e.message || 'Please try again',
          variant: 'destructive',
        });
      }
    },
    [
      priority,
      isCreateMode,
      wsId,
      taskId,
      queryClient,
      propertyCacheBoardId,
      toast,
      setPriority,
      patchPropertyInVisibleCaches,
      triggerPropertyRefresh,
      broadcast,
    ]
  );

  const updateStartDate = useCallback(
    async (newDate: Date | undefined) => {
      setStartDate(newDate);
      if (isCreateMode || !taskId || taskId === 'new') {
        return;
      }

      const dateString = newDate ? newDate.toISOString() : null;
      const cacheSnapshot = snapshotVisibleTaskCaches(
        queryClient,
        propertyCacheBoardId,
        [taskId]
      );

      // Optimistic update - prevents flicker
      patchPropertyInVisibleCaches({ start_date: dateString ?? undefined });

      try {
        const { task } = await updateWorkspaceTask(wsId, taskId, {
          start_date: dateString,
        });
        const updatedStartDate = task.start_date ?? dateString;
        patchPropertyInVisibleCaches({
          start_date: updatedStartDate ?? undefined,
        });
        broadcast?.('task:upsert', {
          task: {
            id: taskId,
            start_date: updatedStartDate,
          },
        });
        triggerPropertyRefresh();
      } catch (e: any) {
        console.error('Failed updating start date', e);
        // Revert optimistic update on error
        restoreVisibleTaskCaches(queryClient, cacheSnapshot);
        toast({
          title: 'Failed to update start date',
          description: e.message || 'Please try again',
          variant: 'destructive',
        });
      }
    },
    [
      isCreateMode,
      wsId,
      taskId,
      queryClient,
      propertyCacheBoardId,
      toast,
      setStartDate,
      patchPropertyInVisibleCaches,
      triggerPropertyRefresh,
      broadcast,
    ]
  );

  const updateEndDate = useCallback(
    async (newDate: Date | undefined) => {
      setEndDate(newDate);
      if (isCreateMode || !taskId || taskId === 'new') {
        return;
      }

      const dateString = newDate ? newDate.toISOString() : null;
      const cacheSnapshot = snapshotVisibleTaskCaches(
        queryClient,
        propertyCacheBoardId,
        [taskId]
      );

      // Optimistic update - prevents flicker
      patchPropertyInVisibleCaches({ end_date: dateString });

      try {
        const { task } = await updateWorkspaceTask(wsId, taskId, {
          end_date: dateString,
        });
        const updatedEndDate = task.end_date ?? dateString;
        patchPropertyInVisibleCaches({ end_date: updatedEndDate });
        broadcast?.('task:upsert', {
          task: {
            id: taskId,
            end_date: updatedEndDate,
          },
        });
        triggerPropertyRefresh();
      } catch (e: any) {
        console.error('Failed updating end date', e);
        // Revert optimistic update on error
        restoreVisibleTaskCaches(queryClient, cacheSnapshot);
        toast({
          title: 'Failed to update end date',
          description: e.message || 'Please try again',
          variant: 'destructive',
        });
      }
    },
    [
      isCreateMode,
      wsId,
      taskId,
      queryClient,
      propertyCacheBoardId,
      toast,
      setEndDate,
      patchPropertyInVisibleCaches,
      triggerPropertyRefresh,
      broadcast,
    ]
  );

  const updateList = useCallback(
    async (newListId: string) => {
      if (newListId === selectedListId) return;
      setSelectedListId(newListId);
      if (isCreateMode || !taskId || taskId === 'new') {
        return;
      }
      const cacheSnapshot = snapshotVisibleTaskCaches(queryClient, boardId, [
        taskId,
      ]);

      // Optimistic update - prevents flicker
      patchTaskInVisibleCaches({
        queryClient,
        boardId,
        taskId,
        updater: (task) => ({ ...task, list_id: newListId }),
      });

      try {
        const { task: updatedTask } = await updateWorkspaceTask(wsId, taskId, {
          list_id: newListId,
        });
        // Update sender's own cache with DB-computed timestamps
        patchTaskInVisibleCaches({
          queryClient,
          boardId,
          taskId,
          updater: (task) => ({
            ...task,
            completed_at: updatedTask.completed_at,
            closed_at: updatedTask.closed_at,
          }),
        });
        broadcast?.('task:upsert', {
          task: {
            id: taskId,
            list_id: newListId,
            completed_at: updatedTask.completed_at,
            closed_at: updatedTask.closed_at,
          },
        });
        toast({
          title: 'List updated',
          description: 'Task moved to new list',
        });
        triggerRefresh();
      } catch (e: any) {
        console.error('Failed updating list', e);
        // Revert optimistic update on error
        restoreVisibleTaskCaches(queryClient, cacheSnapshot);
        toast({
          title: 'Failed to update list',
          description: e.message || 'Please try again',
          variant: 'destructive',
        });
      }
    },
    [
      selectedListId,
      isCreateMode,
      wsId,
      taskId,
      queryClient,
      boardId,
      toast,
      triggerRefresh,
      setSelectedListId,
      broadcast,
    ]
  );

  const saveNameToDatabase = useCallback(
    async (newName: string) => {
      const trimmedName = newName.trim();
      if (!trimmedName || trimmedName === (taskName || '').trim()) return;

      if (isCreateMode || !taskId || taskId === 'new') {
        return;
      }

      // Optimistically update the cache instead of invalidating
      // This prevents conflicts with realtime sync
      const cacheSnapshot = snapshotVisibleTaskCaches(
        queryClient,
        propertyCacheBoardId,
        [taskId]
      );
      patchPropertyInVisibleCaches({ name: trimmedName });

      try {
        const { task } = await updateWorkspaceTask(wsId, taskId, {
          name: trimmedName,
        });
        const updatedName = task.name ?? trimmedName;
        patchPropertyInVisibleCaches({ name: updatedName });
        broadcast?.('task:upsert', {
          task: { id: taskId, name: updatedName },
        });
        triggerPropertyRefresh();
      } catch (e: any) {
        console.error('Failed updating task name', e);
        // Revert optimistic update without refetching visible board caches.
        restoreVisibleTaskCaches(queryClient, cacheSnapshot);
        toast({
          title: 'Failed to update task name',
          description: e.message || 'Please try again',
          variant: 'destructive',
        });
      }
    },
    [
      taskName,
      wsId,
      taskId,
      isCreateMode,
      queryClient,
      propertyCacheBoardId,
      toast,
      patchPropertyInVisibleCaches,
      triggerPropertyRefresh,
      broadcast,
    ]
  );

  const saveSchedulingSettings = useCallback(
    async (
      settings: SchedulingSettings,
      options: SaveSchedulingSettingsOptions = {}
    ): Promise<boolean> => {
      const { silent = false, skipRefresh = false } = options;

      if (isCreateMode || !taskId || taskId === 'new') {
        // In create mode, settings will be saved when the task is created
        return true;
      }

      setSchedulingSaving(true);

      // Optimistic update - scoped to the current user.
      // Scheduling is personal: multiple users can have different settings for the same task.
      queryClient.setQueryData(['task-user-scheduling', taskId], settings);

      try {
        const schedulingPayload: TaskSchedulingUpdatePayload = {
          total_duration: settings.totalDuration,
          is_splittable: settings.isSplittable,
          min_split_duration_minutes: settings.minSplitDurationMinutes,
          max_split_duration_minutes: settings.maxSplitDurationMinutes,
          calendar_hours: settings.calendarHours ?? null,
          auto_schedule: settings.autoSchedule,
        };

        await updateCurrentUserTaskSchedulingSettings(
          taskId,
          schedulingPayload
        );

        // Keep any related query data consistent
        queryClient.invalidateQueries({
          queryKey: ['task-personal-schedule', taskId],
        });

        if (!silent) {
          toast({
            title: 'Scheduling settings saved',
            description:
              'Saved to your personal scheduling profile for this task.',
          });
        }

        // Notify parent components (e.g., server component refresh)
        // Skip in collaboration mode where realtime sync handles updates
        if (!skipRefresh) {
          triggerRefresh();
        }
        return true;
      } catch (e: any) {
        console.error('Failed updating scheduling settings', e);
        // Revert optimistic update on error
        queryClient.invalidateQueries({
          queryKey: ['task-user-scheduling', taskId],
        });
        toast({
          title: 'Failed to save scheduling settings',
          description: e.message || 'Please try again',
          variant: 'destructive',
        });
        return false;
      } finally {
        setSchedulingSaving(false);
      }
    },
    [isCreateMode, taskId, queryClient, toast, triggerRefresh]
  );

  return {
    updateEstimation,
    updatePriority,
    updateStartDate,
    updateEndDate,
    updateList,
    saveNameToDatabase,
    saveSchedulingSettings,
    estimationSaving,
    schedulingSaving,
  };
}
