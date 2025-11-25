import { useQueryClient } from '@tanstack/react-query';
import { createClient } from '@tuturuuu/supabase/next/client';
import type { TaskPriority } from '@tuturuuu/types/primitives/Priority';
import type { CalendarHoursType } from '@tuturuuu/types/primitives/Task';
import { useToast } from '@tuturuuu/ui/hooks/use-toast';
import { invalidateTaskCaches } from '@tuturuuu/utils/task-helper';
import { useCallback, useState } from 'react';

export interface SchedulingSettings {
  totalDuration: number | null;
  isSplittable: boolean;
  minSplitDurationMinutes: number | null;
  maxSplitDurationMinutes: number | null;
  calendarHours: CalendarHoursType | null;
  autoSchedule: boolean;
}

export interface ScheduledCalendarEvent {
  id: string;
  title: string;
  start_at: string;
  end_at: string;
  scheduled_minutes: number;
  completed: boolean;
}

export interface UseTaskMutationsProps {
  taskId?: string;
  wsId: string;
  isCreateMode: boolean;
  boardId: string;
  estimationPoints: number | null;
  priority: TaskPriority | null;
  selectedListId?: string;
  taskName?: string;
  setEstimationPoints: (value: number | null) => void;
  setPriority: (value: TaskPriority | null) => void;
  setStartDate: (value: Date | undefined) => void;
  setEndDate: (value: Date | undefined) => void;
  setSelectedListId: (value: string) => void;
  onUpdate: () => void;
  onCalendarEventsUpdate?: (events: ScheduledCalendarEvent[]) => void;
}

export interface UseTaskMutationsReturn {
  updateEstimation: (points: number | null) => Promise<void>;
  updatePriority: (newPriority: TaskPriority | null) => Promise<void>;
  updateStartDate: (newDate: Date | undefined) => Promise<void>;
  updateEndDate: (newDate: Date | undefined) => Promise<void>;
  updateList: (newListId: string) => Promise<void>;
  saveNameToDatabase: (newName: string) => Promise<void>;
  saveSchedulingSettings: (settings: SchedulingSettings) => Promise<boolean>;
  estimationSaving: boolean;
  schedulingSaving: boolean;
}

const supabase = createClient();

/**
 * Custom hook for task database mutations (CRUD operations on task properties)
 * Extracted from task-edit-dialog.tsx to improve maintainability
 */
export function useTaskMutations({
  taskId,
  wsId,
  isCreateMode,
  boardId,
  estimationPoints,
  priority,
  selectedListId,
  taskName,
  setEstimationPoints,
  setPriority,
  setStartDate,
  setEndDate,
  setSelectedListId,
  onUpdate,
  onCalendarEventsUpdate,
}: UseTaskMutationsProps): UseTaskMutationsReturn {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [estimationSaving, setEstimationSaving] = useState(false);
  const [schedulingSaving, setSchedulingSaving] = useState(false);

  const updateEstimation = useCallback(
    async (points: number | null) => {
      if (points === estimationPoints) return;
      setEstimationPoints(points);
      if (isCreateMode || !taskId || taskId === 'new') {
        return;
      }
      setEstimationSaving(true);
      try {
        const { error } = await supabase
          .from('tasks')
          .update({ estimation_points: points })
          .eq('id', taskId);
        if (error) throw error;
        await invalidateTaskCaches(queryClient, boardId);
      } catch (e: any) {
        console.error('Failed updating estimation', e);
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
      taskId,
      queryClient,
      boardId,
      toast,
      setEstimationPoints,
    ]
  );

  const updatePriority = useCallback(
    async (newPriority: TaskPriority | null) => {
      if (newPriority === priority) return;
      setPriority(newPriority);
      if (isCreateMode || !taskId || taskId === 'new') {
        return;
      }
      try {
        const { error } = await supabase
          .from('tasks')
          .update({ priority: newPriority })
          .eq('id', taskId);
        if (error) throw error;
        await invalidateTaskCaches(queryClient, boardId);
      } catch (e: any) {
        console.error('Failed updating priority', e);
        toast({
          title: 'Failed to update priority',
          description: e.message || 'Please try again',
          variant: 'destructive',
        });
      }
    },
    [priority, isCreateMode, taskId, queryClient, boardId, toast, setPriority]
  );

  const updateStartDate = useCallback(
    async (newDate: Date | undefined) => {
      setStartDate(newDate);
      if (isCreateMode || !taskId || taskId === 'new') {
        return;
      }
      try {
        const { error } = await supabase
          .from('tasks')
          .update({ start_date: newDate ? newDate.toISOString() : null })
          .eq('id', taskId);
        if (error) throw error;
        await invalidateTaskCaches(queryClient, boardId);
      } catch (e: any) {
        console.error('Failed updating start date', e);
        toast({
          title: 'Failed to update start date',
          description: e.message || 'Please try again',
          variant: 'destructive',
        });
      }
    },
    [isCreateMode, taskId, queryClient, boardId, toast, setStartDate]
  );

  const updateEndDate = useCallback(
    async (newDate: Date | undefined) => {
      setEndDate(newDate);
      if (isCreateMode || !taskId || taskId === 'new') {
        return;
      }
      try {
        const { error } = await supabase
          .from('tasks')
          .update({ end_date: newDate ? newDate.toISOString() : null })
          .eq('id', taskId);
        if (error) throw error;
        await invalidateTaskCaches(queryClient, boardId);
      } catch (e: any) {
        console.error('Failed updating end date', e);
        toast({
          title: 'Failed to update end date',
          description: e.message || 'Please try again',
          variant: 'destructive',
        });
      }
    },
    [isCreateMode, taskId, queryClient, boardId, toast, setEndDate]
  );

  const updateList = useCallback(
    async (newListId: string) => {
      if (newListId === selectedListId) return;
      setSelectedListId(newListId);
      if (isCreateMode || !taskId || taskId === 'new') {
        return;
      }
      try {
        const { error } = await supabase
          .from('tasks')
          .update({ list_id: newListId })
          .eq('id', taskId);
        if (error) throw error;
        await invalidateTaskCaches(queryClient, boardId);
        toast({
          title: 'List updated',
          description: 'Task moved to new list',
        });
        onUpdate();
      } catch (e: any) {
        console.error('Failed updating list', e);
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
      taskId,
      queryClient,
      boardId,
      toast,
      onUpdate,
      setSelectedListId,
    ]
  );

  const saveNameToDatabase = useCallback(
    async (newName: string) => {
      const trimmedName = newName.trim();
      if (!trimmedName || trimmedName === (taskName || '').trim()) return;

      if (isCreateMode || !taskId || taskId === 'new') {
        return;
      }

      try {
        const { error } = await supabase
          .from('tasks')
          .update({ name: trimmedName })
          .eq('id', taskId);
        if (error) throw error;
        await invalidateTaskCaches(queryClient, boardId);
      } catch (e: any) {
        console.error('Failed updating task name', e);
        toast({
          title: 'Failed to update task name',
          description: e.message || 'Please try again',
          variant: 'destructive',
        });
      }
    },
    [taskName, taskId, isCreateMode, queryClient, boardId, toast]
  );

  const saveSchedulingSettings = useCallback(
    async (settings: SchedulingSettings): Promise<boolean> => {
      if (isCreateMode || !taskId || taskId === 'new') {
        // In create mode, settings will be saved when the task is created
        return true;
      }

      setSchedulingSaving(true);
      try {
        const { error } = await supabase
          .from('tasks')
          .update({
            total_duration: settings.totalDuration,
            is_splittable: settings.isSplittable,
            min_split_duration_minutes: settings.minSplitDurationMinutes,
            max_split_duration_minutes: settings.maxSplitDurationMinutes,
            calendar_hours: settings.calendarHours,
            auto_schedule: settings.autoSchedule,
          })
          .eq('id', taskId);

        if (error) throw error;

        await invalidateTaskCaches(queryClient, boardId);

        // Auto-schedule if enabled and has duration
        if (
          settings.autoSchedule &&
          settings.totalDuration &&
          settings.totalDuration > 0 &&
          wsId
        ) {
          try {
            const scheduleResponse = await fetch(
              `/api/v1/workspaces/${wsId}/tasks/${taskId}/schedule`,
              {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
              }
            );
            const scheduleData = await scheduleResponse.json();

            if (scheduleResponse.ok) {
              toast({
                title: 'Task auto-scheduled',
                description: scheduleData.message || 'Calendar events created',
              });

              // Show warning if scheduled past deadline
              if (scheduleData.warning) {
                toast({
                  title: 'Scheduling warning',
                  description: scheduleData.warning,
                  variant: 'destructive',
                });
              }

              // Fetch updated events and notify parent
              if (onCalendarEventsUpdate) {
                try {
                  const eventsResponse = await fetch(
                    `/api/v1/workspaces/${wsId}/tasks/${taskId}/schedule`
                  );
                  if (eventsResponse.ok) {
                    const eventsData = await eventsResponse.json();
                    if (eventsData.events && Array.isArray(eventsData.events)) {
                      onCalendarEventsUpdate(
                        eventsData.events.map(
                          (e: {
                            id: string;
                            title: string;
                            start_at: string;
                            end_at: string;
                            scheduled_minutes: number;
                            completed: boolean;
                          }) => ({
                            id: e.id,
                            title: e.title,
                            start_at: e.start_at,
                            end_at: e.end_at,
                            scheduled_minutes: e.scheduled_minutes,
                            completed: e.completed,
                          })
                        )
                      );
                    }
                  }
                } catch (fetchError) {
                  console.error('Failed to fetch updated events:', fetchError);
                }
              }
            } else {
              toast({
                title: 'Settings saved',
                description:
                  scheduleData.error || 'Auto-scheduling could not complete',
              });
            }
          } catch (scheduleError) {
            console.error('Auto-schedule failed:', scheduleError);
            toast({
              title: 'Settings saved',
              description: 'Auto-scheduling could not complete',
            });
          }
        } else {
          toast({
            title: 'Scheduling settings saved',
            description: 'Task scheduling configuration has been updated.',
          });
        }

        onUpdate();
        return true;
      } catch (e: any) {
        console.error('Failed updating scheduling settings', e);
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
    [
      isCreateMode,
      taskId,
      wsId,
      queryClient,
      boardId,
      toast,
      onUpdate,
      onCalendarEventsUpdate,
    ]
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
