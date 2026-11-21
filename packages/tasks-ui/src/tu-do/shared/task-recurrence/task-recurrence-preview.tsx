'use client';

import type { WorkspaceTaskRecurrenceSchedule } from '@tuturuuu/internal-api/task-recurrence';
import { Info } from '@tuturuuu/icons';
import { useMemo } from 'react';
import {
  previewTaskRecurrence,
  type TaskRecurrenceBuildResult,
} from './task-recurrence-choice';
import {
  formatTaskRecurrenceDate,
  type TaskRecurrenceTranslator,
} from './task-recurrence-labels';

interface TaskRecurrencePreviewProps {
  result: TaskRecurrenceBuildResult;
  requestedDate: string;
  explainStart?: boolean;
  locale: string;
  t: TaskRecurrenceTranslator;
}

function usePreview(
  schedule: WorkspaceTaskRecurrenceSchedule | null,
  requestedDate: string
) {
  return useMemo(() => {
    if (!schedule) return null;
    try {
      return previewTaskRecurrence(schedule, requestedDate);
    } catch {
      return null;
    }
  }, [schedule, requestedDate]);
}

/** The next three dates from the shared planner. A picked date that is not a
 * repeat date, or a date absent in the zone, is explained inline with the
 * date the first task will use. */
export function TaskRecurrencePreview({
  result,
  requestedDate,
  explainStart = true,
  locale,
  t,
}: TaskRecurrencePreviewProps) {
  const preview = usePreview(result.ok ? result.schedule : null, requestedDate);
  const format = (date: string) => formatTaskRecurrenceDate(date, locale);

  if (!result.ok || !preview || preview.dates.length === 0) {
    return (
      <p
        role="status"
        className="text-muted-foreground text-xs"
        data-testid="task-recurrence-preview-invalid"
      >
        {t(result.ok ? 'invalid' : result.reason)}
      </p>
    );
  }

  const first = preview.dates.find((item) => !item.skipped);
  const notes: string[] = [];
  if (explainStart && preview.requestedSkipped && first)
    notes.push(
      t('start_skipped', {
        date: format(requestedDate),
        first: format(first.date),
      })
    );
  const absent = preview.dates.find((item) => item.skipped);
  if (absent && first)
    notes.push(
      t('date_skipped', {
        date: format(absent.date),
        timeZone: result.schedule.rule.timeZone,
        first: format(first.date),
      })
    );

  return (
    <div
      role="status"
      aria-live="polite"
      className="space-y-1.5"
      data-testid="task-recurrence-preview"
    >
      <p className="font-medium text-muted-foreground text-xs">
        {t('preview')}
      </p>
      <ol className="space-y-1 text-sm">
        {preview.dates.map((item) => (
          <li
            key={item.date}
            data-skipped={item.skipped ? 'true' : undefined}
            className="flex items-center gap-2"
          >
            <span
              className={
                item.skipped ? 'text-muted-foreground line-through' : ''
              }
            >
              {format(item.date)}
            </span>
            {item.skipped ? (
              <span className="text-muted-foreground text-xs">
                {t('skipped')}
              </span>
            ) : null}
          </li>
        ))}
      </ol>
      {notes.map((note) => (
        <p
          key={note}
          className="flex items-start gap-1.5 text-muted-foreground text-xs"
        >
          <Info aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
          {note}
        </p>
      ))}
    </div>
  );
}
