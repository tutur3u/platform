'use client';

import { useCalendarPreferences } from '@tuturuuu/ui/hooks/use-calendar-preferences';
import { toast } from '@tuturuuu/ui/sonner';
import { useLocale, useTranslations } from 'next-intl';
import { useCallback, useMemo, useState } from 'react';
import type { useTaskFormState } from '../task-edit-dialog/hooks/use-task-form-state';
import type { PendingTaskRelationships } from '../task-edit-dialog/types/pending-relationship';
import { clearDraft, getDraftStorageKey } from '../task-edit-dialog/utils';
import { dispatchTaskSoundCue } from '../task-sound-effects';
import {
  buildTaskRecurrenceSchedule,
  resolveTaskRecurrenceTimeZone,
  TASK_RECURRENCE_TEMPLATE_DESCRIPTION_LIMIT,
  TASK_RECURRENCE_TEMPLATE_TITLE_LIMIT,
  type TaskRecurrenceChoice,
  type TaskRecurrenceTimingDraft,
  taskRecurrenceTemplate,
  taskRecurrenceTimingFromDates,
} from './task-recurrence-choice';
import {
  useCreateTaskRecurrence,
  useTaskRecurrenceEligibility,
} from './use-task-recurrence';

type TaskForm = ReturnType<typeof useTaskFormState>;

function hasPendingTaskRelationships(
  value: PendingTaskRelationships | null | undefined
) {
  return (
    !!value &&
    (!!value.parentTask ||
      value.childTasks.length > 0 ||
      value.blockingTasks.length > 0 ||
      value.blockedByTasks.length > 0 ||
      value.relatedTasks.length > 0)
  );
}

export interface QuickCreateRepeatModel {
  choice: TaskRecurrenceChoice | null;
  timing: TaskRecurrenceTimingDraft;
  locale: string;
  onChange: (choice: TaskRecurrenceChoice | null) => void;
}

export interface QuickCreateRecurrenceInput {
  wsId: string;
  boardId: string;
  form: TaskForm;
  /** Creating in the compact dialog, the only surface that shows Repeat, so
   * the expanded editor never saves a choice it does not display. */
  compactCreate: boolean;
  draftId?: string;
  saveAsDraft: boolean;
  parentTaskId?: string;
  pendingRelationship?: unknown;
  pendingRelationships?: PendingTaskRelationships | null;
  createMultiple: boolean;
  onUpdate: () => void;
  onClose: () => void;
}

/** Owns the quick-create Repeat choice. The chip appears only when the API
 * admits the actor for the selected list; with a choice, saving creates a
 * series (whose first task the server writes) instead of a plain task. */
export function useQuickCreateRecurrence({
  wsId,
  boardId,
  form,
  compactCreate,
  draftId,
  saveAsDraft,
  parentTaskId,
  pendingRelationship,
  pendingRelationships,
  createMultiple,
  onUpdate,
  onClose,
}: QuickCreateRecurrenceInput) {
  const t = useTranslations('ws-task-boards.recurrence');
  const locale = useLocale();
  const { timezone } = useCalendarPreferences();
  // A series template carries no relationships, so creation with any is a
  // plain task and drafts keep their own save path.
  const enabled =
    compactCreate &&
    !draftId &&
    !saveAsDraft &&
    !parentTaskId &&
    !pendingRelationship &&
    !hasPendingTaskRelationships(pendingRelationships);
  const [choice, setChoice] = useState<TaskRecurrenceChoice | null>(null);
  const listId = form.selectedListId;
  const eligible = useTaskRecurrenceEligibility(wsId, listId, enabled);
  const create = useCreateTaskRecurrence(wsId, boardId);
  const startTime = form.startDate?.getTime();
  const endTime = form.endDate?.getTime();
  const timing = useMemo(
    () =>
      taskRecurrenceTimingFromDates({
        startDate: startTime === undefined ? undefined : new Date(startTime),
        endDate: endTime === undefined ? undefined : new Date(endTime),
        timeZone: resolveTaskRecurrenceTimeZone(timezone),
      }),
    [startTime, endTime, timezone]
  );
  const active = enabled && eligible && choice !== null;

  const createRecurringTask = useCallback(
    async (name: string, description: string | null) => {
      const result = choice
        ? buildTaskRecurrenceSchedule(choice, timing)
        : null;
      if (!result?.ok) {
        toast.error(t(result?.reason ?? 'invalid'));
        return;
      }
      if (name.length > TASK_RECURRENCE_TEMPLATE_TITLE_LIMIT) {
        toast.error(t('title_too_long'));
        return;
      }
      if (
        (description?.length ?? 0) > TASK_RECURRENCE_TEMPLATE_DESCRIPTION_LIMIT
      ) {
        toast.error(t('description_too_long'));
        return;
      }
      try {
        await create.mutateAsync({
          listId,
          spec: {
            schedule: result.schedule,
            template: taskRecurrenceTemplate({
              name,
              description,
              priority: form.priority,
              estimationPoints: form.estimationPoints,
              labels: form.selectedLabels,
              projects: form.selectedProjects,
              assignees: form.selectedAssignees,
            }),
          },
        });
      } catch (error) {
        console.error('Failed to create a repeating task', error);
        toast.error(t('create_failed'));
        return;
      }
      toast.success(t('created'));
      dispatchTaskSoundCue('create');
      onUpdate();
      clearDraft(getDraftStorageKey(boardId));
      form.setName('');
      form.setDescription(null);
      if (createMultiple) return;
      setChoice(null);
      onClose();
    },
    [
      choice,
      timing,
      t,
      create,
      listId,
      form,
      onUpdate,
      boardId,
      createMultiple,
      onClose,
    ]
  );

  const chip: QuickCreateRepeatModel | null =
    enabled && eligible
      ? { choice, timing, locale, onChange: setChoice }
      : null;

  return {
    chip,
    createRecurringTask: active ? createRecurringTask : undefined,
  };
}
