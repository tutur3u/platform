'use client';

import type { CalendarWeekday } from '@tuturuuu/types/primitives/calendar-recurrence';
import { ToggleGroup, ToggleGroupItem } from '@tuturuuu/ui/toggle-group';
import { TASK_RECURRENCE_LIMITS } from '@tuturuuu/utils/task-recurrence';
import { useId } from 'react';
import type {
  TaskRecurrenceCustomValues,
  TaskRecurrenceFrequency,
} from './task-recurrence-choice';
import { TaskRecurrenceEndEditor } from './task-recurrence-end-editor';
import {
  formatTaskRecurrenceWeekday,
  TASK_RECURRENCE_WEEK,
  type TaskRecurrenceTranslator,
} from './task-recurrence-labels';
import { TaskRecurrenceNumberInput } from './task-recurrence-number-input';

const FREQUENCIES: TaskRecurrenceFrequency[] = [
  'daily',
  'weekly',
  'monthly',
  'yearly',
];
const LABEL_CLASS = 'font-medium text-muted-foreground text-xs';

interface TaskRecurrenceCustomEditorProps {
  value: TaskRecurrenceCustomValues;
  /** The first date the series may use; bounds UNTIL. */
  requestedDate: string;
  locale: string;
  t: TaskRecurrenceTranslator;
  onChange: (value: TaskRecurrenceCustomValues) => void;
}

/** The CalendarRecurrenceRule v1 task subset: frequency, interval, weekly
 * days, a month day and COUNT/UNTIL ends. */
export function TaskRecurrenceCustomEditor({
  value,
  requestedDate,
  locale,
  t,
  onChange,
}: TaskRecurrenceCustomEditorProps) {
  const id = useId();
  const set = (patch: Partial<TaskRecurrenceCustomValues>) =>
    onChange({ ...value, ...patch });
  const monthly = value.frequency === 'monthly' || value.frequency === 'yearly';
  const clamps = monthly && value.monthDay > 28;

  return (
    <div className="space-y-3" data-testid="task-recurrence-custom-editor">
      <ToggleGroup
        type="single"
        variant="outline"
        size="sm"
        aria-label={t('frequency')}
        value={value.frequency}
        onValueChange={(frequency) =>
          frequency && set({ frequency: frequency as TaskRecurrenceFrequency })
        }
        className="w-full"
      >
        {FREQUENCIES.map((frequency) => (
          <ToggleGroupItem key={frequency} value={frequency} className="flex-1">
            {t(`frequency_${frequency}`)}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>

      <div className="flex items-center gap-2">
        <label htmlFor={`${id}-interval`} className={LABEL_CLASS}>
          {t('interval')}
        </label>
        <TaskRecurrenceNumberInput
          id={`${id}-interval`}
          min={1}
          max={TASK_RECURRENCE_LIMITS.maxInterval}
          value={value.interval}
          onValueChange={(interval) => set({ interval })}
          className="h-8 w-16"
        />
        <span className="text-sm">
          {t(`unit_${value.frequency}`, { count: value.interval })}
        </span>
      </div>

      {value.frequency === 'weekly' ? (
        <ToggleGroup
          type="multiple"
          variant="outline"
          size="sm"
          aria-label={t('weekdays_label')}
          value={value.weekdays}
          onValueChange={(weekdays) =>
            weekdays.length > 0 &&
            set({ weekdays: weekdays as CalendarWeekday[] })
          }
          className="w-full"
        >
          {TASK_RECURRENCE_WEEK.map((day) => (
            <ToggleGroupItem
              key={day}
              value={day}
              aria-label={formatTaskRecurrenceWeekday(day, locale, 'long')}
              className="flex-1 px-0"
            >
              {formatTaskRecurrenceWeekday(day, locale, 'narrow')}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      ) : null}

      {monthly ? (
        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor={`${id}-day`} className={LABEL_CLASS}>
            {t('month_day')}
          </label>
          <TaskRecurrenceNumberInput
            id={`${id}-day`}
            min={1}
            max={31}
            value={value.monthDay}
            onValueChange={(monthDay) => set({ monthDay })}
            className="h-8 w-16"
            aria-describedby={clamps ? `${id}-clamp` : undefined}
          />
          {clamps ? (
            <span id={`${id}-clamp`} className="text-muted-foreground text-xs">
              {t('month_day_clamp')}
            </span>
          ) : null}
        </div>
      ) : null}

      <TaskRecurrenceEndEditor
        value={value.end}
        requestedDate={requestedDate}
        labelClassName={LABEL_CLASS}
        t={t}
        onChange={(end) => set({ end })}
      />
    </div>
  );
}
