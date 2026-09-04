'use client';

import { CalendarDays, Clock } from '@tuturuuu/icons';
import { useTranslations } from 'next-intl';
import type {
  QuickWeeklyScheduleDraft,
  QuickWeeklySchedulePreview,
} from './quick-weekly-schedule-utils';
import { SESSION_EDITOR_DAYS } from './session-editor-utils';

export function QuickWeeklyScheduleConfirmation({
  draft,
  preview,
  selectedGroupName,
}: {
  draft: QuickWeeklyScheduleDraft;
  preview: QuickWeeklySchedulePreview;
  selectedGroupName?: string | null;
}) {
  const t = useTranslations('ws-user-group-schedule');
  const commonT = useTranslations('common');
  const formatDays = (days: number[]) =>
    SESSION_EDITOR_DAYS.filter((day) => days.includes(day.value))
      .map((day) => commonT(day.labelKey))
      .join(', ');

  return (
    <div className="space-y-4">
      <div className="grid gap-3 rounded-xl border bg-muted/20 p-4 text-sm sm:grid-cols-2">
        <div>
          <div className="text-muted-foreground">{t('group')}</div>
          <div className="font-medium">
            {selectedGroupName ?? t('untitled_session')}
          </div>
        </div>
        <div>
          <div className="text-muted-foreground">{t('starts_on')}</div>
          <div className="font-medium">{draft.startDate}</div>
        </div>
        <div>
          <div className="text-muted-foreground">{t('interval_weeks')}</div>
          <div className="font-medium">
            {t('quick_weekly_interval', { count: draft.intervalWeeks })}
          </div>
        </div>
        <div>
          <div className="text-muted-foreground">{t('schedule_ends')}</div>
          <div className="font-medium">
            {draft.endMode === 'never' ? t('repeat_forever') : draft.untilDate}
          </div>
        </div>
        <div>
          <div className="text-muted-foreground">
            {t('quick_weekly_offset')}
          </div>
          <div className="font-medium">{preview.offsetLabel}</div>
        </div>
      </div>

      <div className="space-y-2">
        <h3 className="font-medium text-sm">{t('timeframes')}</h3>
        {draft.patterns.map((pattern, index) => (
          <div
            key={pattern.id}
            className="flex flex-col gap-2 rounded-xl border bg-background p-3 text-sm sm:flex-row sm:items-center sm:justify-between"
          >
            <div>
              <div className="font-medium">
                {t('timeframe_number', { count: index + 1 })}
              </div>
              <div className="text-muted-foreground">
                {formatDays(pattern.daysOfWeek)}
              </div>
            </div>
            <div className="flex items-center gap-2 font-medium tabular-nums">
              <Clock className="h-4 w-4 text-muted-foreground" />
              {pattern.startTime} - {pattern.endTime}
            </div>
          </div>
        ))}
      </div>

      <div className="rounded-xl border p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="font-medium text-sm">
            {t('quick_weekly_first_dates')}
          </div>
          <div className="text-muted-foreground text-sm">
            {preview.count === null
              ? t('quick_weekly_ongoing')
              : t('quick_weekly_session_count', { count: preview.count })}
          </div>
        </div>
        {draft.endMode === 'never' ? (
          <p className="mt-1 text-muted-foreground text-xs">
            {t('frequency_preview_horizon', {
              date: preview.previewUntilDate,
            })}
          </p>
        ) : null}
        {preview.firstDates.length > 0 ? (
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {preview.firstDates.map((date) => (
              <div
                key={`${date.patternId}-${date.startsAt}`}
                className="flex min-w-0 items-center gap-2 rounded-lg bg-muted/40 px-3 py-2 text-sm"
              >
                <CalendarDays className="h-4 w-4 shrink-0 text-dynamic-blue" />
                <span className="truncate font-medium">{date.label}</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="mt-3 text-muted-foreground text-sm">
            {t('quick_weekly_no_dates')}
          </div>
        )}
      </div>
    </div>
  );
}
