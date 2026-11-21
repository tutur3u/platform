'use client';

import { ChevronLeft } from '@tuturuuu/icons';
import type { TaskRecurrencePreset } from '@tuturuuu/utils/task-recurrence';
import { Button } from '@tuturuuu/ui/button';
import { useTranslations } from 'next-intl';
import { type ReactNode, useMemo, useState } from 'react';
import { QuickCreateOptionPicker } from '../task-edit-dialog/components/quick-create/quick-create-option-picker';
import {
  buildTaskRecurrenceSchedule,
  defaultTaskRecurrenceCustomValues,
  type TaskRecurrenceChoice,
  type TaskRecurrenceTimingDraft,
} from './task-recurrence-choice';
import { TaskRecurrenceCustomEditor } from './task-recurrence-custom-editor';
import type { TaskRecurrenceTranslator } from './task-recurrence-labels';
import { TaskRecurrencePreview } from './task-recurrence-preview';

export const TASK_RECURRENCE_OPTIONS = [
  'daily',
  'weekdays',
  'weekly',
  'monthly',
  'custom',
] as const;

interface TaskRecurrencePickerProps {
  choice: TaskRecurrenceChoice | null;
  timing: TaskRecurrenceTimingDraft;
  locale: string;
  onChange: (choice: TaskRecurrenceChoice | null) => void;
  /** Confirms the choice; also closes the surrounding popover. */
  onDone: () => void;
  /** Cmd/Ctrl+Enter inside the list; closes without confirming. */
  onDismiss?: () => void;
  /** Explains a picked date that is not a repeat date. */
  explainStart?: boolean;
  /** Hides "Don't repeat", for series that already exist. */
  hideClear?: boolean;
  /** Replaces the custom view's Done button, e.g. a scoped save. */
  customFooter?: ReactNode;
}

/** Presets with a custom editor, and a three-date preview of the choice. */
export function TaskRecurrencePicker({
  choice,
  timing,
  locale,
  onChange,
  onDone,
  onDismiss = onDone,
  explainStart = true,
  hideClear = false,
  customFooter,
}: TaskRecurrencePickerProps) {
  const t = useTranslations(
    'ws-task-boards.recurrence'
  ) as TaskRecurrenceTranslator;
  const tq = useTranslations('ws-task-boards.dialog.quick_create');
  const [view, setView] = useState<'list' | 'custom'>(
    choice?.preset === 'custom' ? 'custom' : 'list'
  );
  const result = useMemo(
    () => (choice ? buildTaskRecurrenceSchedule(choice, timing) : null),
    [choice, timing]
  );

  if (view === 'custom' && choice?.preset === 'custom') {
    return (
      <div className="space-y-3 p-3" data-testid="task-recurrence-custom-view">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="-ml-2 h-7 gap-1 px-2 text-muted-foreground"
          onClick={() => setView('list')}
        >
          <ChevronLeft aria-hidden="true" className="size-4" />
          {t('custom')}
        </Button>
        <TaskRecurrenceCustomEditor
          value={choice.custom}
          requestedDate={timing.requestedDate}
          locale={locale}
          t={t}
          onChange={(custom) => onChange({ preset: 'custom', custom })}
        />
        {result ? (
          <TaskRecurrencePreview
            result={result}
            requestedDate={timing.requestedDate}
            explainStart={explainStart}
            locale={locale}
            t={t}
          />
        ) : null}
        <div className="flex justify-end">
          {customFooter ?? (
            <Button
              type="button"
              size="sm"
              disabled={!result?.ok}
              onClick={onDone}
            >
              {t('done')}
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div>
      <QuickCreateOptionPicker
        options={TASK_RECURRENCE_OPTIONS.map((id) => ({ id, label: t(id) }))}
        selectedIds={choice ? [choice.preset] : []}
        searchPlaceholder={tq('search')}
        emptyLabel={tq('no_results')}
        numericShortcuts="position"
        onDismiss={onDismiss}
        onSelect={(id) => {
          if (id === 'custom') {
            onChange(
              choice?.preset === 'custom'
                ? choice
                : {
                    preset: 'custom',
                    custom: defaultTaskRecurrenceCustomValues(
                      timing.requestedDate
                    ),
                  }
            );
            setView('custom');
            return;
          }
          onChange({ preset: id as TaskRecurrencePreset });
          onDone();
        }}
        clearLabel={hideClear ? undefined : t('none')}
        onClear={
          hideClear
            ? undefined
            : () => {
                onChange(null);
                onDone();
              }
        }
      />
      {result ? (
        <div className="border-t p-3">
          <TaskRecurrencePreview
            result={result}
            requestedDate={timing.requestedDate}
            explainStart={explainStart}
            locale={locale}
            t={t}
          />
        </div>
      ) : null}
    </div>
  );
}
