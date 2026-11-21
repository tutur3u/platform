'use client';

import { Input } from '@tuturuuu/ui/input';
import { ToggleGroup, ToggleGroupItem } from '@tuturuuu/ui/toggle-group';
import { TASK_RECURRENCE_LIMITS } from '@tuturuuu/utils/task-recurrence';
import { useId } from 'react';
import type { TaskRecurrenceEnd } from './task-recurrence-choice';
import type { TaskRecurrenceTranslator } from './task-recurrence-labels';
import { TaskRecurrenceNumberInput } from './task-recurrence-number-input';

const END_TYPES: TaskRecurrenceEnd['type'][] = ['never', 'count', 'until'];

function addYears(date: string, years: number) {
  return `${Number(date.slice(0, 4)) + years}${date.slice(4)}`;
}

interface TaskRecurrenceEndEditorProps {
  value: TaskRecurrenceEnd;
  /** The first date the series may use; bounds UNTIL to five years. */
  requestedDate: string;
  labelClassName: string;
  t: TaskRecurrenceTranslator;
  onChange: (value: TaskRecurrenceEnd) => void;
}

/** Never, after 1–1,000 occurrences, or on a date within five years. */
export function TaskRecurrenceEndEditor({
  value,
  requestedDate,
  labelClassName,
  t,
  onChange,
}: TaskRecurrenceEndEditorProps) {
  const id = useId();

  return (
    <div className="space-y-2">
      <span id={`${id}-ends`} className={labelClassName}>
        {t('ends')}
      </span>
      <ToggleGroup
        type="single"
        variant="outline"
        size="sm"
        aria-labelledby={`${id}-ends`}
        value={value.type}
        onValueChange={(type) => {
          if (type === 'never') onChange({ type: 'never' });
          if (type === 'count') onChange({ type: 'count', count: 10 });
          if (type === 'until')
            onChange({ type: 'until', date: addYears(requestedDate, 1) });
        }}
        className="w-full"
      >
        {END_TYPES.map((type) => (
          <ToggleGroupItem key={type} value={type} className="flex-1">
            {t(`ends_option_${type}`)}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      {value.type === 'count' ? (
        <div className="flex items-center gap-2">
          <TaskRecurrenceNumberInput
            aria-label={t('ends_count_label')}
            min={1}
            max={TASK_RECURRENCE_LIMITS.maxCount}
            value={value.count}
            onValueChange={(count) => onChange({ type: 'count', count })}
            className="h-8 w-20"
          />
          <span className="text-sm">
            {t('unit_times', { count: value.count })}
          </span>
        </div>
      ) : null}
      {value.type === 'until' ? (
        <Input
          type="date"
          aria-label={t('ends_until_label')}
          min={requestedDate}
          max={addYears(requestedDate, TASK_RECURRENCE_LIMITS.maxUntilYears)}
          value={value.date}
          onChange={(event) =>
            event.target.value &&
            onChange({ type: 'until', date: event.target.value })
          }
          className="h-8 w-44"
        />
      ) : null}
    </div>
  );
}
