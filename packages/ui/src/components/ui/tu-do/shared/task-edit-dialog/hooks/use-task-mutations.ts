import { useQueryClient } from '@tanstack/react-query';
import { createClient } from '@tuturuuu/supabase/next/client';
import type { TaskPriority } from '@tuturuuu/types/primitives/Priority';
import { useToast } from '@tuturuuu/ui/hooks/use-toast';
import { invalidateTaskCaches } from '@tuturuuu/utils/task-helper';
import { useCallback, useState } from 'react';

export interface UseTaskMutationsProps {
  taskId?: string;
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
}

export interface UseTaskMutationsReturn {
  updateEstimation: (points: number | null) => Promise<void>;
  updatePriority: (newPriority: TaskPriority | null) => Promise<void>;
  updateStartDate: (newDate: Date | undefined) => Promise<void>;
  updateEndDate: (newDate: Date | undefined) => Promise<void>;
  updateList: (newListId: string) => Promise<void>;
  saveNameToDatabase: (newName: string) => Promise<void>;
  estimationSaving: boolean;
}

const supabase = createClient();

/**
 * Custom hook for task database mutations (CRUD operations on task properties)
 * Extracted from task-edit-dialog.tsx to improve maintainability
 */
export function useTaskMutations({
  taskId,
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
}: UseTaskMutationsProps): UseTaskMutationsReturn {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [estimationSaving, setEstimationSaving] = useState(false);

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

  return {
    updateEstimation,
    updatePriority,
    updateStartDate,
    updateEndDate,
    updateList,
    saveNameToDatabase,
    estimationSaving,
  };
}
