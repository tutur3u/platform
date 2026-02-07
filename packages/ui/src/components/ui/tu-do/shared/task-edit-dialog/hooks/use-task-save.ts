'use client';

import type { QueryClient } from '@tanstack/react-query';
import type { JSONContent } from '@tiptap/react';
import { createClient } from '@tuturuuu/supabase/next/client';
import type { CalendarHoursType, Task } from '@tuturuuu/types/primitives/Task';
import { useToast } from '@tuturuuu/ui/hooks/use-toast';
import {
  createTaskRelationship,
  useUpdateTask,
} from '@tuturuuu/utils/task-helper';
import type React from 'react';
import { useCallback, useRef } from 'react';
import type { PendingRelationship } from '../types/pending-relationship';
import { clearDraft } from '../utils';
import { useUpdateSharedTask } from './use-update-shared-task';

const supabase = createClient();

export interface UseTaskSaveProps {
  // Core identifiers
  wsId: string;
  boardId: string;
  taskId?: string;
  saveAsDraft: boolean;
  draftId?: string;
  isCreateMode: boolean;
  collaborationMode: boolean;
  isPersonalWorkspace: boolean;
  /** Present when opened via /shared/task/[shareCode] */
  shareCode?: string;
  /** Permission returned from shared-task API */
  sharedPermission?: 'view' | 'edit';
  parentTaskId?: string;
  pendingRelationship?: PendingRelationship;
  draftStorageKey: string;

  // Form state
  name: string;
  description: JSONContent | null;
  priority: 'critical' | 'high' | 'low' | 'normal' | null;
  startDate: Date | undefined;
  endDate: Date | undefined;
  selectedListId: string;
  estimationPoints: number | null | undefined;
  selectedLabels: Array<{ id: string }>;
  selectedAssignees: Array<{ id: string; user_id?: string | null }>;
  selectedProjects: Array<{ id: string }>;

  // Scheduling fields
  totalDuration: number | null;
  isSplittable: boolean;
  minSplitDurationMinutes: number | null;
  maxSplitDurationMinutes: number | null;
  calendarHours: CalendarHoursType | null;
  autoSchedule: boolean;

  // User settings
  user: {
    id: string;
    display_name?: string | null;
    avatar_url?: string | null;
  } | null;
  userTaskSettings?: { task_auto_assign_to_self: boolean };

  // UI state
  createMultiple: boolean;

  // Refs
  nameUpdateTimerRef: React.MutableRefObject<ReturnType<
    typeof setTimeout
  > | null>;
  pendingNameRef: React.MutableRefObject<string | null>;
  flushEditorPendingRef: React.MutableRefObject<
    (() => JSONContent | null) | undefined
  >;

  // Callbacks
  queryClient: QueryClient;
  onUpdate: () => void;
  onClose: () => void;

  // State setters
  setIsSaving: (saving: boolean) => void;
  setIsLoading: (loading: boolean) => void;
  setName: React.Dispatch<React.SetStateAction<string>>;
  setDescription: React.Dispatch<React.SetStateAction<JSONContent | null>>;
  setPriority: React.Dispatch<
    React.SetStateAction<'critical' | 'high' | 'low' | 'normal' | null>
  >;
  setStartDate: React.Dispatch<React.SetStateAction<Date | undefined>>;
  setEndDate: React.Dispatch<React.SetStateAction<Date | undefined>>;
  setEstimationPoints: React.Dispatch<
    React.SetStateAction<number | null | undefined>
  >;
  setSelectedLabels: React.Dispatch<
    React.SetStateAction<
      Array<{ id: string; name: string; color: string; created_at: string }>
    >
  >;
  setSelectedAssignees: React.Dispatch<
    React.SetStateAction<
      Array<{
        id: string;
        user_id?: string | null;
        display_name?: string | null;
        avatar_url?: string | null;
      }>
    >
  >;
  setSelectedProjects: React.Dispatch<
    React.SetStateAction<Array<{ id: string; name: string }>>
  >;
}

export interface UseTaskSaveReturn {
  handleSave: () => Promise<void>;
  handleSaveRef: React.MutableRefObject<() => void>;
}

export function useTaskSave({
  wsId,
  boardId,
  taskId,
  saveAsDraft,
  draftId,
  isCreateMode,
  collaborationMode,
  isPersonalWorkspace,
  shareCode,
  sharedPermission,
  parentTaskId,
  pendingRelationship,
  draftStorageKey,
  name,
  description,
  priority,
  startDate,
  endDate,
  selectedListId,
  estimationPoints,
  selectedLabels,
  selectedAssignees,
  selectedProjects,
  totalDuration,
  isSplittable,
  minSplitDurationMinutes,
  maxSplitDurationMinutes,
  calendarHours,
  autoSchedule,
  user,
  userTaskSettings,
  createMultiple,
  nameUpdateTimerRef,
  pendingNameRef,
  flushEditorPendingRef,
  queryClient,
  onUpdate,
  onClose,
  setIsSaving,
  setIsLoading,
  setName,
  setDescription,
  setPriority,
  setStartDate,
  setEndDate,
  setEstimationPoints,
  setSelectedLabels,
  setSelectedAssignees,
  setSelectedProjects,
}: UseTaskSaveProps): UseTaskSaveReturn {
  const { toast } = useToast();
  const updateTaskMutation = useUpdateTask(boardId);
  const updateSharedTaskMutation = useUpdateSharedTask();
  const handleSaveRef = useRef<() => void>(() => {});

  const handleSave = useCallback(async () => {
    if (!name?.trim()) return;

    // Shared task links may be view-only.
    if (!isCreateMode && shareCode && sharedPermission !== 'edit') {
      toast({
        title: 'Read-only access',
        description: 'You do not have permission to edit this task.',
        variant: 'destructive',
      });
      return;
    }

    // Clear any pending name update
    if (nameUpdateTimerRef.current) {
      clearTimeout(nameUpdateTimerRef.current);
      nameUpdateTimerRef.current = null;
      pendingNameRef.current = null;
    }

    // Get current description from editor
    let currentDescription = description;
    if (flushEditorPendingRef.current) {
      const flushedContent = flushEditorPendingRef.current();
      if (flushedContent) currentDescription = flushedContent;
    }

    setIsSaving(true);
    setIsLoading(true);
    clearDraft(draftStorageKey);

    // Serialize description
    let descriptionString: string | null = null;
    if (currentDescription) {
      try {
        descriptionString = JSON.stringify(currentDescription);
      } catch (serializationError) {
        console.error('Failed to serialize description:', serializationError);
        descriptionString = null;
      }
    }

    if (isCreateMode && saveAsDraft) {
      await handleSaveAsDraft({
        wsId,
        boardId,
        draftId,
        name,
        descriptionString,
        priority,
        startDate,
        endDate,
        selectedListId,
        estimationPoints,
        selectedLabels,
        selectedAssignees,
        selectedProjects,
        createMultiple,
        queryClient,
        toast,
        onClose,
        setIsLoading,
        setIsSaving,
        setName,
        setDescription,
        setPriority,
        setStartDate,
        setEndDate,
        setEstimationPoints,
        setSelectedLabels,
        setSelectedAssignees,
        setSelectedProjects,
      });
      return;
    }

    if (isCreateMode) {
      await handleCreateTask({
        name,
        descriptionString,
        priority,
        startDate,
        endDate,
        selectedListId,
        estimationPoints,
        selectedLabels,
        selectedAssignees,
        selectedProjects,
        totalDuration,
        isSplittable,
        minSplitDurationMinutes,
        maxSplitDurationMinutes,
        calendarHours,
        autoSchedule,
        parentTaskId,
        pendingRelationship,
        isPersonalWorkspace,
        user,
        userTaskSettings,
        createMultiple,
        boardId,
        queryClient,
        toast,
        onUpdate,
        onClose,
        setIsLoading,
        setIsSaving,
        setName,
        setDescription,
        setPriority,
        setStartDate,
        setEndDate,
        setEstimationPoints,
        setSelectedLabels,
        setSelectedAssignees,
        setSelectedProjects,
      });
      return;
    }

    // Update mode
    await handleUpdateTask({
      taskId,
      name,
      descriptionString,
      priority,
      startDate,
      endDate,
      selectedListId,
      estimationPoints,
      collaborationMode,
      flushEditorPendingRef,
      updateTaskMutation,
      updateSharedTaskMutation,
      shareCode,
      toast,
      onUpdate,
      onClose,
      setIsLoading,
      setIsSaving,
    });
  }, [
    name,
    description,
    draftStorageKey,
    isCreateMode,
    saveAsDraft,
    draftId,
    wsId,
    priority,
    startDate,
    endDate,
    estimationPoints,
    selectedListId,
    selectedLabels,
    selectedAssignees,
    selectedProjects,
    queryClient,
    boardId,
    toast,
    onUpdate,
    createMultiple,
    onClose,
    taskId,
    updateTaskMutation,
    updateSharedTaskMutation,
    collaborationMode,
    setName,
    setDescription,
    setPriority,
    setStartDate,
    setEndDate,
    setEstimationPoints,
    setSelectedLabels,
    setSelectedAssignees,
    setSelectedProjects,
    totalDuration,
    isSplittable,
    minSplitDurationMinutes,
    maxSplitDurationMinutes,
    calendarHours,
    autoSchedule,
    parentTaskId,
    pendingRelationship,
    isPersonalWorkspace,
    user,
    userTaskSettings,
    nameUpdateTimerRef,
    pendingNameRef,
    flushEditorPendingRef,
    setIsLoading,
    setIsSaving,
    shareCode,
    sharedPermission,
  ]);

  // Keep ref updated
  handleSaveRef.current = handleSave;

  return {
    handleSave,
    handleSaveRef,
  };
}

// Helper function for saving as draft
async function handleSaveAsDraft({
  wsId,
  boardId,
  draftId,
  name,
  descriptionString,
  priority,
  startDate,
  endDate,
  selectedListId,
  estimationPoints,
  selectedLabels,
  selectedAssignees,
  selectedProjects,
  createMultiple,
  queryClient,
  toast,
  onClose,
  setIsLoading,
  setIsSaving,
  setName,
  setDescription,
  setPriority,
  setStartDate,
  setEndDate,
  setEstimationPoints,
  setSelectedLabels,
  setSelectedAssignees,
  setSelectedProjects,
}: {
  wsId: string;
  boardId: string;
  draftId?: string;
  name: string;
  descriptionString: string | null;
  priority: 'critical' | 'high' | 'low' | 'normal' | null;
  startDate: Date | undefined;
  endDate: Date | undefined;
  selectedListId: string;
  estimationPoints: number | null | undefined;
  selectedLabels: Array<{ id: string }>;
  selectedAssignees: Array<{ id: string; user_id?: string | null }>;
  selectedProjects: Array<{ id: string }>;
  createMultiple: boolean;
  queryClient: QueryClient;
  toast: ReturnType<typeof useToast>['toast'];
  onClose: () => void;
  setIsLoading: (loading: boolean) => void;
  setIsSaving: (saving: boolean) => void;
  setName: React.Dispatch<React.SetStateAction<string>>;
  setDescription: React.Dispatch<React.SetStateAction<JSONContent | null>>;
  setPriority: React.Dispatch<
    React.SetStateAction<'critical' | 'high' | 'low' | 'normal' | null>
  >;
  setStartDate: React.Dispatch<React.SetStateAction<Date | undefined>>;
  setEndDate: React.Dispatch<React.SetStateAction<Date | undefined>>;
  setEstimationPoints: React.Dispatch<
    React.SetStateAction<number | null | undefined>
  >;
  setSelectedLabels: React.Dispatch<
    React.SetStateAction<
      Array<{ id: string; name: string; color: string; created_at: string }>
    >
  >;
  setSelectedAssignees: React.Dispatch<
    React.SetStateAction<
      Array<{
        id: string;
        user_id?: string | null;
        display_name?: string | null;
        avatar_url?: string | null;
      }>
    >
  >;
  setSelectedProjects: React.Dispatch<
    React.SetStateAction<Array<{ id: string; name: string }>>
  >;
}) {
  try {
    const draftPayload = {
      name: name.trim(),
      description: descriptionString || null,
      priority: priority || null,
      board_id: boardId || null,
      list_id: selectedListId || null,
      start_date: startDate ? startDate.toISOString() : null,
      end_date: endDate ? endDate.toISOString() : null,
      estimation_points: estimationPoints ?? null,
      label_ids: selectedLabels.map((l) => l.id),
      assignee_ids: selectedAssignees.map((a) => a.user_id || a.id),
      project_ids: selectedProjects.map((p) => p.id),
    };

    const url = draftId
      ? `/api/v1/workspaces/${wsId}/task-drafts/${draftId}`
      : `/api/v1/workspaces/${wsId}/task-drafts`;

    const res = await fetch(url, {
      method: draftId ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(draftPayload),
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to save draft');
    }

    // Invalidate drafts query so the drafts page updates
    await queryClient.invalidateQueries({ queryKey: ['task-drafts'] });

    toast({
      title: draftId ? 'Draft updated' : 'Saved as draft',
      description: draftId
        ? 'Your draft has been updated.'
        : 'Task saved to Drafts. You can convert it to a task later.',
    });

    if (createMultiple) {
      setName('');
      setDescription(null);
      setTimeout(() => {
        const input = document.querySelector<HTMLInputElement>(
          'input[data-task-name-input]'
        );
        input?.focus();
      }, 0);
    } else {
      setName('');
      setDescription(null);
      setPriority(null);
      setStartDate(undefined);
      setEndDate(undefined);
      setEstimationPoints(null);
      setSelectedLabels([]);
      setSelectedAssignees([]);
      setSelectedProjects([]);
      onClose();
    }
  } catch (error: unknown) {
    console.error('Error saving draft:', error);
    toast({
      title: 'Error saving draft',
      description: (error as Error).message || 'Please try again later',
      variant: 'destructive',
    });
  } finally {
    setIsLoading(false);
    setIsSaving(false);
  }
}

// Helper function for creating tasks
async function handleCreateTask({
  name,
  descriptionString,
  priority,
  startDate,
  endDate,
  selectedListId,
  estimationPoints,
  selectedLabels,
  selectedAssignees,
  selectedProjects,
  totalDuration,
  isSplittable,
  minSplitDurationMinutes,
  maxSplitDurationMinutes,
  calendarHours,
  autoSchedule,
  parentTaskId,
  pendingRelationship,
  isPersonalWorkspace,
  user,
  userTaskSettings,
  createMultiple,
  boardId,
  queryClient,
  toast,
  onUpdate,
  onClose,
  setIsLoading,
  setIsSaving,
  setName,
  setDescription,
  setPriority,
  setStartDate,
  setEndDate,
  setEstimationPoints,
  setSelectedLabels,
  setSelectedAssignees,
  setSelectedProjects,
}: {
  name: string;
  descriptionString: string | null;
  priority: 'critical' | 'high' | 'low' | 'normal' | null;
  startDate: Date | undefined;
  endDate: Date | undefined;
  selectedListId: string;
  estimationPoints: number | null | undefined;
  selectedLabels: Array<{ id: string }>;
  selectedAssignees: Array<{ id: string; user_id?: string | null }>;
  selectedProjects: Array<{ id: string }>;
  totalDuration: number | null;
  isSplittable: boolean;
  minSplitDurationMinutes: number | null;
  maxSplitDurationMinutes: number | null;
  calendarHours: CalendarHoursType | null;
  autoSchedule: boolean;
  parentTaskId?: string;
  pendingRelationship?: PendingRelationship;
  isPersonalWorkspace: boolean;
  user: {
    id: string;
    display_name?: string | null;
    avatar_url?: string | null;
  } | null;
  userTaskSettings?: { task_auto_assign_to_self: boolean };
  createMultiple: boolean;
  boardId: string;
  queryClient: QueryClient;
  toast: ReturnType<typeof useToast>['toast'];
  onUpdate: () => void;
  onClose: () => void;
  setIsLoading: (loading: boolean) => void;
  setIsSaving: (saving: boolean) => void;
  setName: React.Dispatch<React.SetStateAction<string>>;
  setDescription: React.Dispatch<React.SetStateAction<JSONContent | null>>;
  setPriority: React.Dispatch<
    React.SetStateAction<'critical' | 'high' | 'low' | 'normal' | null>
  >;
  setStartDate: React.Dispatch<React.SetStateAction<Date | undefined>>;
  setEndDate: React.Dispatch<React.SetStateAction<Date | undefined>>;
  setEstimationPoints: React.Dispatch<
    React.SetStateAction<number | null | undefined>
  >;
  setSelectedLabels: React.Dispatch<
    React.SetStateAction<
      Array<{ id: string; name: string; color: string; created_at: string }>
    >
  >;
  setSelectedAssignees: React.Dispatch<
    React.SetStateAction<
      Array<{
        id: string;
        user_id?: string | null;
        display_name?: string | null;
        avatar_url?: string | null;
      }>
    >
  >;
  setSelectedProjects: React.Dispatch<
    React.SetStateAction<Array<{ id: string; name: string }>>
  >;
}) {
  try {
    const { createTask } = await import('@tuturuuu/utils/task-helper');
    const taskData: Partial<Task> = {
      name: name.trim(),
      description: descriptionString || '',
      priority: priority,
      start_date: startDate ? startDate.toISOString() : undefined,
      end_date: endDate ? endDate.toISOString() : undefined,
      estimation_points: estimationPoints ?? null,
      // IMPORTANT: scheduling settings are personal and stored separately
      // (task_user_scheduling_settings). Do not persist them to the shared task row.
    };
    const newTask = await createTask(supabase, selectedListId, taskData);

    // Save per-user scheduling settings for the creator (if any were provided)
    if (user?.id) {
      const hasAnySchedulingValue =
        totalDuration != null ||
        calendarHours != null ||
        autoSchedule === true ||
        isSplittable === true ||
        minSplitDurationMinutes != null ||
        maxSplitDurationMinutes != null;

      if (hasAnySchedulingValue) {
        const { error: schedulingError } = await (supabase as any)
          .from('task_user_scheduling_settings')
          .upsert(
            {
              task_id: newTask.id,
              user_id: user.id,
              total_duration: totalDuration,
              is_splittable: isSplittable,
              min_split_duration_minutes: minSplitDurationMinutes,
              max_split_duration_minutes: maxSplitDurationMinutes,
              calendar_hours: calendarHours,
              auto_schedule: autoSchedule,
            },
            { onConflict: 'task_id,user_id' }
          );

        if (schedulingError) {
          console.error(
            'Failed to save personal scheduling settings:',
            schedulingError
          );
        }
      }
    }

    // Handle parent task relationship
    if (parentTaskId) {
      try {
        await createTaskRelationship(supabase, {
          source_task_id: parentTaskId,
          target_task_id: newTask.id,
          type: 'parent_child',
        });
      } catch (relationshipError) {
        console.error(
          'Failed to create parent-child relationship:',
          relationshipError
        );
      }
      await queryClient.invalidateQueries({
        queryKey: ['task-relationships', parentTaskId],
      });
    }

    // Handle pending relationships
    if (pendingRelationship) {
      await handlePendingRelationship(
        newTask.id,
        pendingRelationship,
        queryClient
      );
    }

    // Handle labels
    if (selectedLabels.length > 0) {
      const { error: labelsError } = await supabase
        .from('task_labels')
        .insert(
          selectedLabels.map((l) => ({ task_id: newTask.id, label_id: l.id }))
        );
      if (labelsError) console.error('Error adding labels:', labelsError);
    }

    // Handle assignees
    let finalAssignees = [...selectedAssignees];
    if (
      finalAssignees.length === 0 &&
      userTaskSettings?.task_auto_assign_to_self &&
      user?.id &&
      !isPersonalWorkspace
    ) {
      finalAssignees = [
        {
          id: user.id,
          user_id: user.id,
        },
      ];
    }
    if (finalAssignees.length > 0) {
      const assigneesToInsert = finalAssignees
        .map((a) => ({ task_id: newTask.id, user_id: a.user_id || a.id }))
        .filter((a) => a.user_id);
      if (assigneesToInsert.length > 0) {
        const { error: assigneesError } = await supabase
          .from('task_assignees')
          .insert(assigneesToInsert);
        if (assigneesError) {
          console.error('Error adding assignees:', assigneesError);
          toast({
            title: 'Warning',
            description: 'Task created but some assignees could not be added',
            variant: 'destructive',
          });
        }
      }
    }

    // Handle projects
    if (selectedProjects.length > 0) {
      const { error: projectsError } = await supabase
        .from('task_project_tasks')
        .insert(
          selectedProjects.map((p) => ({
            task_id: newTask.id,
            project_id: p.id,
          }))
        );
      if (projectsError) console.error('Error adding projects:', projectsError);
    }

    // Update cache
    queryClient.setQueryData(['tasks', boardId], (old: Task[] | undefined) => {
      if (!old) return [newTask];
      if (old.some((t) => t.id === newTask.id)) return old;
      return [...old, newTask];
    });
    await queryClient.invalidateQueries({ queryKey: ['time-tracking-data'] });

    toast({
      title: parentTaskId ? 'Sub-task created' : 'Task created',
      description: parentTaskId ? 'New sub-task added.' : 'New task added.',
    });
    onUpdate();

    if (createMultiple) {
      setName('');
      setDescription(null);
      setTimeout(() => {
        const input = document.querySelector<HTMLInputElement>(
          'input[data-task-name-input]'
        );
        input?.focus();
      }, 0);
    } else {
      setName('');
      setDescription(null);
      setPriority(null);
      setStartDate(undefined);
      setEndDate(undefined);
      setEstimationPoints(null);
      setSelectedLabels([]);
      setSelectedAssignees([]);
      setSelectedProjects([]);
      onClose();
    }
  } catch (error: unknown) {
    console.error('Error creating task:', error);
    toast({
      title: 'Error creating task',
      description: (error as Error).message || 'Please try again later',
      variant: 'destructive',
    });
  } finally {
    setIsLoading(false);
    setIsSaving(false);
  }
}

// Helper function for pending relationships
async function handlePendingRelationship(
  newTaskId: string,
  pendingRelationship: PendingRelationship,
  queryClient: QueryClient
) {
  try {
    const { type, relatedTaskId } = pendingRelationship;
    let relationshipData:
      | {
          source_task_id: string;
          target_task_id: string;
          type: 'parent_child' | 'blocks' | 'related';
        }
      | undefined;

    switch (type) {
      case 'parent':
        relationshipData = {
          source_task_id: newTaskId,
          target_task_id: relatedTaskId,
          type: 'parent_child',
        };
        break;
      case 'blocking':
        relationshipData = {
          source_task_id: relatedTaskId,
          target_task_id: newTaskId,
          type: 'blocks',
        };
        break;
      case 'blocked-by':
        relationshipData = {
          source_task_id: newTaskId,
          target_task_id: relatedTaskId,
          type: 'blocks',
        };
        break;
      case 'related':
        relationshipData = {
          source_task_id: relatedTaskId,
          target_task_id: newTaskId,
          type: 'related',
        };
        break;
    }

    if (relationshipData) {
      await createTaskRelationship(supabase, relationshipData);
      await queryClient.invalidateQueries({
        queryKey: ['task-relationships', relatedTaskId],
      });
      await queryClient.invalidateQueries({
        queryKey: ['task-relationships', newTaskId],
      });
    }
  } catch (relationshipError) {
    console.error('Failed to create pending relationship:', relationshipError);
  }
}

// Helper function for updating tasks
async function handleUpdateTask({
  taskId,
  name,
  descriptionString,
  priority,
  startDate,
  endDate,
  selectedListId,
  estimationPoints,
  collaborationMode,
  flushEditorPendingRef,
  updateTaskMutation,
  updateSharedTaskMutation,
  shareCode,
  toast,
  onUpdate,
  onClose,
  setIsLoading,
  setIsSaving,
}: {
  taskId?: string;
  name: string;
  descriptionString: string | null;
  priority: 'critical' | 'high' | 'low' | 'normal' | null;
  startDate: Date | undefined;
  endDate: Date | undefined;
  selectedListId: string;
  estimationPoints: number | null | undefined;
  collaborationMode: boolean;
  flushEditorPendingRef: React.MutableRefObject<
    (() => JSONContent | null) | undefined
  >;
  updateTaskMutation: ReturnType<typeof useUpdateTask>;
  updateSharedTaskMutation: ReturnType<typeof useUpdateSharedTask>;
  shareCode?: string;
  toast: ReturnType<typeof useToast>['toast'];
  onUpdate: () => void;
  onClose: () => void;
  setIsLoading: (loading: boolean) => void;
  setIsSaving: (saving: boolean) => void;
}) {
  const taskUpdates: Partial<Task> & { description?: string | undefined } = {
    name: name.trim(),
    priority: priority,
    start_date: startDate ? startDate.toISOString() : undefined,
    end_date: endDate ? endDate.toISOString() : undefined,
    list_id: selectedListId,
    estimation_points: estimationPoints ?? null,
    // IMPORTANT: scheduling settings are personal and stored separately
    // (task_user_scheduling_settings). Do not persist them to the shared task row.
  };

  if (collaborationMode && flushEditorPendingRef.current) {
    const yjsDescription = flushEditorPendingRef.current();
    taskUpdates.description = yjsDescription
      ? JSON.stringify(yjsDescription)
      : undefined;
  } else {
    taskUpdates.description = descriptionString ?? undefined;
  }

  if (taskId) {
    // Shared task editing (no workspace membership required): use shared endpoint.
    if (shareCode) {
      updateSharedTaskMutation.mutate(
        { shareCode, updates: taskUpdates },
        {
          onSuccess: async () => {
            toast({
              title: 'Task updated',
              description: 'The task has been successfully updated.',
            });
            onUpdate();
            onClose();
          },
          onError: (error: Error) => {
            console.error('Error updating shared task:', error);
            toast({
              title: 'Error updating task',
              description: error.message || 'Please try again later',
              variant: 'destructive',
            });
          },
          onSettled: () => {
            setIsLoading(false);
            setIsSaving(false);
          },
        }
      );
      return;
    }

    updateTaskMutation.mutate(
      { taskId, updates: taskUpdates },
      {
        onSuccess: async () => {
          toast({
            title: 'Task updated',
            description: 'The task has been successfully updated.',
          });
          onUpdate();
          onClose();
        },
        onError: (error: Error) => {
          console.error('Error updating task:', error);
          toast({
            title: 'Error updating task',
            description: error.message || 'Please try again later',
            variant: 'destructive',
          });
        },
        onSettled: () => {
          setIsLoading(false);
          setIsSaving(false);
        },
      }
    );
  }
}
