'use client';

import type { WorkspaceTaskRecurrenceStatusAction } from '@tuturuuu/internal-api/task-recurrence';
import { Repeat } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { Popover, PopoverAnchor, PopoverContent } from '@tuturuuu/ui/popover';
import { toast } from '@tuturuuu/ui/sonner';
import { useLocale, useTranslations } from 'next-intl';
import { useMemo, useRef, useState } from 'react';
import type { useTaskFormState } from '../task-edit-dialog/hooks/use-task-form-state';
import { TaskPropertyRow } from '../task-edit-dialog/task-property-row';
import { serializeTaskDescriptionContent } from '../task-edit-dialog/utils';
import { TaskRecurrenceBadge } from './task-recurrence-badge';
import {
  buildTaskRecurrenceSchedule,
  type TaskRecurrenceChoice,
  taskRecurrenceChoiceFromSchedule,
  taskRecurrenceScheduleAfter,
  taskRecurrenceScheduleFromEntry,
  taskRecurrenceTemplate,
  taskRecurrenceTemplatesDiffer,
  taskRecurrenceTimingFromSchedule,
} from './task-recurrence-choice';
import {
  formatTaskRecurrenceSummary,
  type TaskRecurrenceTranslator,
} from './task-recurrence-labels';
import { TaskRecurrencePicker } from './task-recurrence-picker';
import {
  type TaskRecurrenceEditScope,
  TaskRecurrenceScopePrompt,
} from './task-recurrence-scope-prompt';
import { TaskRecurrenceStatusMenu } from './task-recurrence-status-menu';
import {
  type TaskRecurrenceChange,
  useTaskRecurrenceEntry,
  useTaskRecurrenceTemplate,
  useUpdateTaskRecurrence,
} from './use-task-recurrence';

type TaskForm = ReturnType<typeof useTaskFormState>;

/** Conflicts the member can act on get their own message. */
function taskRecurrenceErrorKey(error: unknown) {
  const message = error instanceof Error ? error.message : '';
  if (message === 'TASK_RECURRENCE_CONSUMED_DATE') return 'edit_from_latest';
  if (message === 'TASK_RECURRENCE_STALE_SERIES') return 'stale';
  return 'update_failed';
}

interface TaskRecurrenceRowProps {
  wsId: string;
  task?: { id: string };
  form: TaskForm;
  canEdit?: boolean;
}

/** The task detail's Repeat row. It renders only for a task in a series the
 * member may read; editing needs manage access, which the template read
 * proves. */
export function TaskRecurrenceRow({
  wsId,
  task,
  form,
  canEdit = true,
}: TaskRecurrenceRowProps) {
  const t = useTranslations(
    'ws-task-boards.recurrence'
  ) as TaskRecurrenceTranslator;
  const locale = useLocale();
  const entry = useTaskRecurrenceEntry(wsId, task?.id);
  const template = useTaskRecurrenceTemplate(wsId, task?.id ?? '', !!entry);
  const update = useUpdateTaskRecurrence(wsId, template ?? entry);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<TaskRecurrenceChoice | null>(null);
  const draftRef = useRef<TaskRecurrenceChoice | null>(null);
  const [dismissed, setDismissed] = useState<string | null>(null);
  // The fields when the series loaded: only edits made since then prompt.
  const [baseline, setBaseline] = useState<string | null>(null);
  const schedule = useMemo(
    () => (template ? taskRecurrenceScheduleFromEntry(template) : null),
    [template]
  );
  const timing = useMemo(
    () =>
      schedule && entry
        ? taskRecurrenceTimingFromSchedule(schedule, entry.occurrence_date)
        : null,
    [schedule, entry]
  );
  const current = taskRecurrenceTemplate({
    name: form.name,
    description: serializeTaskDescriptionContent(form.description),
    priority: form.priority,
    estimationPoints: form.estimationPoints,
    labels: form.selectedLabels,
    projects: form.selectedProjects,
    assignees: form.selectedAssignees,
  });
  const currentKey = JSON.stringify(current);
  if (template && baseline === null) setBaseline(currentKey);

  if (!entry || !task) return null;

  const summary = schedule
    ? formatTaskRecurrenceSummary(schedule, t, locale)
    : undefined;
  const manageable = canEdit && !!template?.template && !!schedule && !!timing;
  const showScope =
    manageable &&
    template.state !== 'ended' &&
    baseline !== null &&
    baseline !== currentKey &&
    dismissed !== currentKey &&
    taskRecurrenceTemplatesDiffer(template.template!, current);

  const run = (change: TaskRecurrenceChange, onDone?: () => void) =>
    update.mutate(change, {
      onSuccess: () => {
        toast.success(t('updated'));
        onDone?.();
      },
      onError: (error) => toast.error(t(taskRecurrenceErrorKey(error))),
    });

  const saveSchedule = () => {
    const choice = draftRef.current;
    if (!choice || !timing || !template?.template) return setEditing(false);
    const result = buildTaskRecurrenceSchedule(choice, timing);
    if (!result.ok) return void toast.error(t(result.reason));
    run(
      {
        kind: 'edit',
        spec: { schedule: result.schedule, template: template.template },
      },
      () => setEditing(false)
    );
  };

  const applyScope = (scope: TaskRecurrenceEditScope) => {
    if (scope === 'only_this' || !schedule) return setDismissed(currentKey);
    const following = taskRecurrenceScheduleAfter(
      schedule,
      entry.occurrence_date
    );
    if (!following) return void toast.error(t('invalid'));
    run(
      { kind: 'edit', spec: { schedule: following, template: current } },
      () => setDismissed(currentKey)
    );
  };

  const changeDraft = (choice: TaskRecurrenceChoice | null) => {
    draftRef.current = choice;
    setDraft(choice);
  };

  return (
    <section aria-label={t('repeat')} className="mb-2 border-b pb-2 text-sm">
      <TaskPropertyRow icon={Repeat} label={t('repeat')}>
        <Popover open={editing} onOpenChange={setEditing}>
          <PopoverAnchor asChild>
            <div className="flex min-h-8 items-center gap-1">
              <TaskRecurrenceBadge
                state={entry.state}
                summary={summary}
                size="md"
              />
              {manageable ? (
                <TaskRecurrenceStatusMenu
                  state={template.state}
                  disabled={update.isPending}
                  onEdit={() => {
                    changeDraft(taskRecurrenceChoiceFromSchedule(schedule));
                    setEditing(true);
                  }}
                  onStatus={(action: WorkspaceTaskRecurrenceStatusAction) =>
                    run({ kind: 'status', action })
                  }
                />
              ) : null}
            </div>
          </PopoverAnchor>
          {manageable && editing ? (
            <PopoverContent align="start" className="w-72 p-0">
              <TaskRecurrencePicker
                choice={draft}
                timing={timing}
                locale={locale}
                hideClear
                onChange={changeDraft}
                onDone={saveSchedule}
                onDismiss={() => setEditing(false)}
                explainStart={false}
                customFooter={
                  <Button
                    type="button"
                    size="sm"
                    disabled={update.isPending}
                    onClick={saveSchedule}
                  >
                    {t('save_following')}
                  </Button>
                }
              />
            </PopoverContent>
          ) : null}
        </Popover>
        {showScope ? (
          <TaskRecurrenceScopePrompt
            pending={update.isPending}
            onApply={applyScope}
          />
        ) : null}
      </TaskPropertyRow>
    </section>
  );
}
