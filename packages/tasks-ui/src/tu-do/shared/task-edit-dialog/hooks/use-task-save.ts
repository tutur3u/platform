'use client';

import type { QueryClient } from '@tanstack/react-query';
import type { Editor, JSONContent } from '@tiptap/react';
import type { WorkspaceTaskUpdatePayload } from '@tuturuuu/internal-api/tasks';
import type { CalendarHoursType } from '@tuturuuu/types/primitives/Task';
import { notifySave } from '@tuturuuu/ui/save-notification';
import {
  MAX_TASK_DESCRIPTION_LENGTH,
  MAX_TASK_NAME_LENGTH,
} from '@tuturuuu/utils/constants';
import { convertJsonContentToYjsState } from '@tuturuuu/utils/yjs-helper';
import { useTranslations } from 'next-intl';
import type React from 'react';
import { useCallback, useRef } from 'react';
import {
  getActiveBroadcast,
  useBoardBroadcast,
} from '../../board-broadcast-context';
import { dispatchTaskSoundCue } from '../../task-sound-effects';
import type {
  PendingRelationship,
  PendingTaskRelationships,
} from '../types/pending-relationship';
import {
  clearDraft,
  getDraftStorageKey,
  loadDraft,
  saveDraft,
  serializeTaskDescriptionContent,
  updateTaskDescriptionCaches,
} from '../utils';
import { handleCreateTask } from './create-task-with-recovery';
import { beginTaskDraftSave } from './task-draft-save-session';

export { handleCreateTask } from './create-task-with-recovery';
export {
  applyPendingRelationshipSummary,
  dedupeById,
  persistPendingTaskRelationships,
} from './task-create-relationships';

import {
  updateWorkspaceTask,
  updateWorkspaceTaskDescription,
} from './task-api';

import type {
  SaveSchedulingSettingsOptions,
  SchedulingSettings,
} from './use-task-mutations';
import { useUpdateSharedTask } from './use-update-shared-task';

export { getLegacyPendingTaskRelationships } from './optimistic-task-creation';

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
  pendingTaskRelationships?: PendingTaskRelationships;
  draftStorageKey: string;

  // Form state
  name: string;
  description: JSONContent | null;
  editorInstance: Editor | null;
  priority: 'critical' | 'high' | 'low' | 'normal' | null;
  startDate: Date | undefined;
  endDate: Date | undefined;
  selectedListId: string;
  estimationPoints: number | null | undefined;
  selectedLabels: Array<{
    id: string;
    name?: string;
    color?: string;
    created_at?: string;
  }>;
  selectedAssignees: Array<{
    id: string;
    user_id?: string | null;
    display_name?: string | null;
    avatar_url?: string | null;
  }>;
  selectedProjects: Array<{ id: string; name?: string; status?: string }>;

  // Scheduling fields
  totalDuration: number | null;
  isSplittable: boolean;
  minSplitDurationMinutes: number | null;
  maxSplitDurationMinutes: number | null;
  calendarHours: CalendarHoursType | null;
  autoSchedule: boolean;
  saveSchedulingSettings?: (
    settings: SchedulingSettings,
    options?: SaveSchedulingSettingsOptions
  ) => Promise<boolean>;
  hasUnsavedSchedulingChanges?: boolean;

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
  pendingTaskRelationships,
  draftStorageKey,
  name,
  description,
  editorInstance,
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
  saveSchedulingSettings,
  hasUnsavedSchedulingChanges,
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
  const toast = notifySave;
  const t = useTranslations('ws-task-boards.dialog');
  const updateSharedTaskMutation = useUpdateSharedTask();
  const contextBroadcast = useBoardBroadcast();
  const broadcast = contextBroadcast ?? getActiveBroadcast();
  const handleSaveRef = useRef<() => void>(() => {});

  const handleSave = useCallback(async () => {
    if (!name?.trim()) return;
    const finishSave = beginTaskDraftSave(draftStorageKey);
    if (!finishSave) return;
    try {
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
        currentDescription = flushEditorPendingRef.current();
      }

      setIsSaving(true);
      setIsLoading(true);

      const trimmedName = name.trim();
      const descriptionString =
        serializeTaskDescriptionContent(currentDescription);
      const descriptionYjsState =
        currentDescription && editorInstance?.schema
          ? Array.from(
              convertJsonContentToYjsState(
                currentDescription,
                editorInstance.schema
              )
            )
          : null;

      if (trimmedName.length > MAX_TASK_NAME_LENGTH) {
        toast({
          title: t('title_too_long_title'),
          description: t('title_too_long_description', {
            max: MAX_TASK_NAME_LENGTH,
          }),
          variant: 'destructive',
        });
        setIsLoading(false);
        setIsSaving(false);
        return;
      }

      if (
        descriptionString &&
        descriptionString.length > MAX_TASK_DESCRIPTION_LENGTH
      ) {
        toast({
          title: t('description_too_long_title'),
          description: t('description_too_long_description', {
            max: MAX_TASK_DESCRIPTION_LENGTH,
          }),
          variant: 'destructive',
        });
        setIsLoading(false);
        setIsSaving(false);
        return;
      }

      if (isCreateMode) {
        saveDraft(draftStorageKey, {
          ...loadDraft(draftStorageKey),
          name: trimmedName,
          description: currentDescription,
          priority,
          startDate: startDate?.toISOString(),
          endDate: endDate?.toISOString(),
          selectedListId,
          estimationPoints,
          selectedLabels,
          selectedAssignees,
          selectedProjects,
          pendingTaskRelationships,
          totalDuration,
          isSplittable,
          minSplitDurationMinutes,
          maxSplitDurationMinutes,
          calendarHours,
          autoSchedule,
        });
      }

      if (isCreateMode && saveAsDraft) {
        await handleSaveAsDraft({
          wsId,
          boardId,
          draftId,
          name: trimmedName,
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

      const schedulingSettings: SchedulingSettings = {
        totalDuration,
        isSplittable,
        minSplitDurationMinutes,
        maxSplitDurationMinutes,
        calendarHours,
        autoSchedule,
      };

      if (
        !isCreateMode &&
        hasUnsavedSchedulingChanges &&
        saveSchedulingSettings &&
        taskId &&
        taskId !== 'new'
      ) {
        const schedulingSaved = await saveSchedulingSettings(
          schedulingSettings,
          {
            silent: true,
            skipRefresh: true,
          }
        );

        if (!schedulingSaved) {
          setIsLoading(false);
          setIsSaving(false);
          return;
        }
      }

      if (isCreateMode) {
        await handleCreateTask({
          wsId,
          failureDescription: (error) =>
            t('create_recovery', { error: error || t('create_unconfirmed') }),
          name: trimmedName,
          descriptionString,
          descriptionYjsState,
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
          pendingTaskRelationships,
          isPersonalWorkspace,
          user,
          userTaskSettings,
          createMultiple,
          boardId,
          broadcast,
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
        wsId,
        boardId,
        name: trimmedName,
        descriptionString,
        descriptionYjsState,
        priority,
        startDate,
        endDate,
        selectedListId,
        estimationPoints,
        collaborationMode,
        flushEditorPendingRef,
        updateSharedTaskMutation,
        shareCode,
        queryClient,
        toast,
        onUpdate,
        onClose,
        setIsLoading,
        setIsSaving,
      });
    } finally {
      finishSave();
      setIsSaving(false);
      setIsLoading(false);
    }
  }, [
    name,
    description,
    editorInstance,
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
    onUpdate,
    createMultiple,
    onClose,
    taskId,
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
    hasUnsavedSchedulingChanges,
    saveSchedulingSettings,
    parentTaskId,
    pendingRelationship,
    pendingTaskRelationships,
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
    broadcast,
    t,
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
  selectedLabels: Array<{
    id: string;
    name?: string;
    color?: string;
    created_at?: string;
  }>;
  selectedAssignees: Array<{
    id: string;
    user_id?: string | null;
    display_name?: string | null;
    avatar_url?: string | null;
  }>;
  selectedProjects: Array<{ id: string; name?: string; status?: string }>;
  createMultiple: boolean;
  queryClient: QueryClient;
  toast: typeof notifySave;
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

    clearDraft(getDraftStorageKey(boardId, draftId));

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
// Helper function for updating tasks
async function handleUpdateTask({
  taskId,
  wsId,
  boardId,
  name,
  descriptionString,
  descriptionYjsState,
  priority,
  startDate,
  endDate,
  selectedListId,
  estimationPoints,
  collaborationMode,
  flushEditorPendingRef,
  updateSharedTaskMutation,
  shareCode,
  queryClient,
  toast,
  onUpdate,
  onClose,
  setIsLoading,
  setIsSaving,
}: {
  taskId?: string;
  wsId: string;
  boardId: string;
  name: string;
  descriptionString: string | null;
  descriptionYjsState: number[] | null;
  priority: 'critical' | 'high' | 'low' | 'normal' | null;
  startDate: Date | undefined;
  endDate: Date | undefined;
  selectedListId: string;
  estimationPoints: number | null | undefined;
  collaborationMode: boolean;
  flushEditorPendingRef: React.MutableRefObject<
    (() => JSONContent | null) | undefined
  >;
  updateSharedTaskMutation: ReturnType<typeof useUpdateSharedTask>;
  shareCode?: string;
  queryClient: QueryClient;
  toast: typeof notifySave;
  onUpdate: () => void;
  onClose: () => void;
  setIsLoading: (loading: boolean) => void;
  setIsSaving: (saving: boolean) => void;
}) {
  const taskUpdates: WorkspaceTaskUpdatePayload = {
    name: name.trim(),
    priority: priority,
    start_date: startDate ? startDate.toISOString() : undefined,
    end_date: endDate ? endDate.toISOString() : undefined,
    list_id: selectedListId,
    estimation_points: estimationPoints ?? null,
    // IMPORTANT: scheduling settings are personal and stored separately
    // (task_user_scheduling_settings). Do not persist them to the shared task row.
  };

  if (taskId) {
    // Shared task editing (no workspace membership required): use shared endpoint.
    if (shareCode) {
      const sharedDescription =
        collaborationMode && flushEditorPendingRef.current
          ? (serializeTaskDescriptionContent(flushEditorPendingRef.current()) ??
            undefined)
          : (descriptionString ?? undefined);

      await updateSharedTaskMutation
        .mutateAsync(
          {
            shareCode,
            updates: {
              ...taskUpdates,
              description: sharedDescription,
            },
          },
          {
            onSuccess: async () => {
              toast({
                title: 'Task updated',
                description: 'The task has been successfully updated.',
              });
              dispatchTaskSoundCue('update');
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
              queryClient.invalidateQueries({ queryKey: ['task-history'] });
            },
          }
        )
        .catch(() => {
          /* onError above preserves the existing error feedback. */
        });
      return;
    }

    try {
      await updateWorkspaceTask(wsId, taskId, taskUpdates);
      await updateWorkspaceTaskDescription(wsId, taskId, {
        description: descriptionString,
        description_yjs_state: descriptionYjsState,
      });
      updateTaskDescriptionCaches({
        taskId,
        descriptionString,
        boardId,
        queryClient,
      });
      toast({
        title: 'Task updated',
        description: 'The task has been successfully updated.',
      });
      dispatchTaskSoundCue('update');
      onUpdate();
      onClose();
    } catch (error) {
      console.error('Error updating task:', error);
      toast({
        title: 'Error updating task',
        description:
          error instanceof Error ? error.message : 'Please try again later',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
      setIsSaving(false);
      queryClient.invalidateQueries({ queryKey: ['task-history'] });
    }
  }
}
