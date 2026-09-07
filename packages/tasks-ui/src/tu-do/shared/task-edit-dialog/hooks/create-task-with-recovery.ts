'use client';
import type { QueryClient } from '@tanstack/react-query';
import type { JSONContent } from '@tiptap/react';
import { updateCurrentUserTaskSchedulingSettings } from '@tuturuuu/internal-api';
import { createClient } from '@tuturuuu/supabase/next/client';
import type { CalendarHoursType, Task } from '@tuturuuu/types/primitives/Task';
import type { notifySave } from '@tuturuuu/ui/save-notification';
import {
  createOptimisticTask,
  createTask,
  insertOptimisticTaskIntoBoardCaches,
  reconcileOptimisticTaskInBoardCaches,
  removeOptimisticTaskFromBoardCaches,
} from '@tuturuuu/utils/task-helper';
import type React from 'react';
import type { BoardBroadcastFn } from '../../board-broadcast-context';
import { dispatchTaskSoundCue } from '../../task-sound-effects';
import type {
  PendingRelationship,
  PendingTaskRelationships,
} from '../types/pending-relationship';
import { clearDraft, getDraftStorageKey, loadDraft, saveDraft } from '../utils';
import {
  getLegacyPendingTaskRelationships,
  withTaskCreateRelations,
} from './optimistic-task-creation';
import {
  shouldChunkTaskDescriptionPayload,
  updateWorkspaceTask,
  updateWorkspaceTaskDescription,
} from './task-api';
import {
  applyPendingRelationshipSummary,
  persistPendingTaskRelationships,
} from './task-create-relationships';

const supabase = createClient();

export async function handleCreateTask({
  wsId,
  failureDescription,
  name,
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
}: {
  wsId: string;
  failureDescription?: (error?: string) => string;
  name: string;
  descriptionString: string | null;
  descriptionYjsState: number[] | null;
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
  totalDuration: number | null;
  isSplittable: boolean;
  minSplitDurationMinutes: number | null;
  maxSplitDurationMinutes: number | null;
  calendarHours: CalendarHoursType | null;
  autoSchedule: boolean;
  parentTaskId?: string;
  pendingRelationship?: PendingRelationship;
  pendingTaskRelationships?: PendingTaskRelationships;
  isPersonalWorkspace: boolean;
  user: {
    id: string;
    display_name?: string | null;
    avatar_url?: string | null;
  } | null;
  userTaskSettings?: { task_auto_assign_to_self: boolean };
  createMultiple: boolean;
  boardId: string;
  broadcast: BoardBroadcastFn | null;
  queryClient: QueryClient;
  toast: typeof notifySave;
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
  const normalizedPendingRelationships =
    pendingTaskRelationships ??
    getLegacyPendingTaskRelationships(parentTaskId, pendingRelationship);
  const optimisticAssignees =
    selectedAssignees.length === 0 &&
    userTaskSettings?.task_auto_assign_to_self &&
    user &&
    !isPersonalWorkspace
      ? [
          {
            id: user.id,
            user_id: user.id,
            display_name: user.display_name,
            avatar_url: user.avatar_url,
          },
        ]
      : selectedAssignees;
  const optimisticTask = createOptimisticTask(
    withTaskCreateRelations(
      {
        name: name.trim(),
        description: descriptionString || '',
        priority,
        start_date: startDate?.toISOString(),
        end_date: endDate?.toISOString(),
        estimation_points: estimationPoints ?? null,
        list_id: selectedListId,
      },
      {
        pendingTaskRelationships: normalizedPendingRelationships,
        selectedAssignees: optimisticAssignees,
        selectedLabels,
        selectedProjects,
      }
    )
  );
  const draftKey = getDraftStorageKey(boardId);
  const recoveryDraft = loadDraft(draftKey);
  let persistedTask: Task | null =
    recoveryDraft?.persistedWorkspaceId === wsId
      ? (recoveryDraft.persistedTask ?? null)
      : null;

  insertOptimisticTaskIntoBoardCaches(queryClient, boardId, optimisticTask);

  try {
    let resolvedUserId = user?.id;
    if (!resolvedUserId) {
      const {
        data: { user: authUser },
      } = await supabase.auth.getUser();
      resolvedUserId = authUser?.id;
    }

    let desiredAssignees = [...selectedAssignees];
    if (
      desiredAssignees.length === 0 &&
      userTaskSettings?.task_auto_assign_to_self &&
      resolvedUserId &&
      !isPersonalWorkspace
    ) {
      desiredAssignees = [
        {
          id: resolvedUserId,
          user_id: resolvedUserId,
        },
      ];
    }

    const createDescriptionPayload = {
      description: descriptionString || '',
      description_yjs_state: descriptionYjsState ?? undefined,
    };
    const shouldDeferDescription = shouldChunkTaskDescriptionPayload(
      createDescriptionPayload
    );

    const taskData: Partial<Task> = {
      name: name.trim(),
      description: shouldDeferDescription ? '' : descriptionString || '',
      priority: priority,
      start_date: startDate ? startDate.toISOString() : undefined,
      end_date: endDate ? endDate.toISOString() : undefined,
      estimation_points: estimationPoints ?? null,
      // IMPORTANT: scheduling settings are personal and stored separately
      // (task_user_scheduling_settings). Do not persist them to the shared task row.
    };
    const createPayload = {
      ...taskData,
      description_yjs_state: shouldDeferDescription
        ? undefined
        : (descriptionYjsState ?? undefined),
      label_ids: selectedLabels.map((label) => label.id),
      assignee_ids: desiredAssignees
        .map((assignee) => assignee.user_id || assignee.id)
        .filter((assigneeId): assigneeId is string => !!assigneeId),
      project_ids: selectedProjects.map((project) => project.id),
    };
    const resumingTask = !!persistedTask;
    const newTask =
      persistedTask ?? (await createTask(wsId, selectedListId, createPayload));
    if (!newTask?.id) throw new Error();
    if (persistedTask) {
      await updateWorkspaceTask(wsId, newTask.id, {
        name: name.trim(),
        priority,
        start_date: startDate?.toISOString() ?? null,
        end_date: endDate?.toISOString() ?? null,
        estimation_points: estimationPoints ?? null,
        list_id: selectedListId,
        label_ids: createPayload.label_ids,
        assignee_ids: createPayload.assignee_ids,
        project_ids: createPayload.project_ids,
      });
      Object.assign(newTask, taskData, { list_id: selectedListId });
    }
    persistedTask = newTask;
    // Keep the confirmed row identity across a reload during follow-up writes.
    saveDraft(draftKey, {
      ...loadDraft(draftKey),
      persistedTask,
      persistedWorkspaceId: wsId,
    });
    reconcileOptimisticTaskInBoardCaches(
      queryClient,
      boardId,
      optimisticTask.id,
      {
        ...withTaskCreateRelations(newTask, {
          pendingTaskRelationships: normalizedPendingRelationships,
          selectedAssignees: desiredAssignees,
          selectedLabels,
          selectedProjects,
        }),
        _isOptimistic: true,
      } as Task
    );

    if (shouldDeferDescription || resumingTask) {
      await updateWorkspaceTaskDescription(wsId, newTask.id, {
        description: descriptionString,
        description_yjs_state: descriptionYjsState,
      });
      newTask.description = descriptionString ?? undefined;
    }

    // Save per-user scheduling settings for the creator (if any were provided)
    const hasAnySchedulingValue =
      totalDuration != null ||
      calendarHours != null ||
      autoSchedule === true ||
      isSplittable === true ||
      minSplitDurationMinutes != null ||
      maxSplitDurationMinutes != null;

    if (hasAnySchedulingValue || resumingTask) {
      await updateCurrentUserTaskSchedulingSettings(newTask.id, {
        total_duration: totalDuration,
        is_splittable: isSplittable,
        min_split_duration_minutes: minSplitDurationMinutes,
        max_split_duration_minutes: maxSplitDurationMinutes,
        calendar_hours: calendarHours ?? null,
        auto_schedule: autoSchedule,
      });
    }

    const affectedRelationshipTaskIds = await persistPendingTaskRelationships(
      wsId,
      newTask.id,
      normalizedPendingRelationships,
      queryClient,
      {
        confirmed: loadDraft(draftKey)?.confirmedRelationships ?? [],
        save: (confirmedRelationships) =>
          saveDraft(draftKey, {
            ...loadDraft(draftKey),
            confirmedRelationships,
          }),
      }
    );

    const createdTaskWithRelations = withTaskCreateRelations(newTask, {
      pendingTaskRelationships: normalizedPendingRelationships,
      selectedAssignees: desiredAssignees,
      selectedLabels,
      selectedProjects,
    });

    const locallyCreatedTask = {
      ...(createdTaskWithRelations as Task & { _localMutationAt?: number }),
      _localMutationAt: Date.now(),
    } as Task;

    reconcileOptimisticTaskInBoardCaches(
      queryClient,
      boardId,
      optimisticTask.id,
      locallyCreatedTask
    );
    applyPendingRelationshipSummary({
      boardId,
      newTaskId: newTask.id,
      queryClient,
      pendingTaskRelationships: normalizedPendingRelationships,
    });
    await queryClient.invalidateQueries({
      queryKey: ['task-list-counts', boardId],
    });
    await queryClient.invalidateQueries({ queryKey: ['time-tracking-data'] });

    // Broadcast the new task to other clients
    broadcast?.('task:upsert', { task: createdTaskWithRelations });
    const hasRelations =
      (createdTaskWithRelations.labels?.length ?? 0) > 0 ||
      (createdTaskWithRelations.assignees?.length ?? 0) > 0 ||
      (createdTaskWithRelations.projects?.length ?? 0) > 0;
    if (hasRelations) {
      broadcast?.('task:relations-changed', { taskId: newTask.id });
    }
    if (affectedRelationshipTaskIds.length > 0) {
      broadcast?.('task:deps-changed', {
        taskIds: affectedRelationshipTaskIds,
      });
    }

    toast({
      title: normalizedPendingRelationships.parentTask
        ? 'Sub-task created'
        : 'Task created',
      description: normalizedPendingRelationships.parentTask
        ? 'New sub-task added.'
        : 'New task added.',
    });
    dispatchTaskSoundCue('create');
    onUpdate();
    clearDraft(getDraftStorageKey(boardId));
    if (!createMultiple) {
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

    if (createMultiple) {
      setName('');
      setDescription(null);
      setTimeout(() => {
        const input = document.querySelector<HTMLInputElement>(
          'input[data-task-name-input]'
        );
        input?.focus();
      }, 0);
    }
  } catch (error: unknown) {
    if (persistedTask) {
      saveDraft(draftKey, {
        ...loadDraft(draftKey),
        persistedTask,
        persistedWorkspaceId: wsId,
      });
      reconcileOptimisticTaskInBoardCaches(
        queryClient,
        boardId,
        optimisticTask.id,
        persistedTask
      );
    } else {
      removeOptimisticTaskFromBoardCaches(
        queryClient,
        boardId,
        optimisticTask.id
      );
    }
    console.error('Error creating task:', error);
    toast({
      title: 'Error creating task',
      description:
        failureDescription?.((error as Error).message) ??
        ((error as Error).message || 'Please try again later'),
      variant: 'destructive',
      duration: Number.POSITIVE_INFINITY,
    });
  } finally {
    setIsLoading(false);
    setIsSaving(false);
  }
}
