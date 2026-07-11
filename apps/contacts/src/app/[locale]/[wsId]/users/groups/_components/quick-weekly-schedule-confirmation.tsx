'use client';

import { CalendarDays } from '@tuturuuu/icons';
import { useTranslations } from 'next-intl';
import type {
  QuickWeeklyScheduleDraft,
  QuickWeeklySchedulePreview,
} from './quick-weekly-schedule-utils';

interface QuickWeeklyScheduleConfirmationProps {
  draft: QuickWeeklyScheduleDraft;
  preview: QuickWeeklySchedulePreview;
  selectedDays: string;
  selectedGroupName?: string | null;
}

export function QuickWeeklyScheduleConfirmation({
  draft,
  preview,
  selectedDays,
  selectedGroupName,
}: QuickWeeklyScheduleConfirmationProps) {
  const t = useTranslations('ws-user-group-schedule');

  return (
    <div className="space-y-4">
      <div className="grid gap-3 rounded-md border bg-muted/20 p-3 text-sm sm:grid-cols-2">
        <div>
          <div className="text-muted-foreground">{t('group')}</div>
          <div className="font-medium">
            {selectedGroupName ?? t('untitled_session')}
          </div>
        </div>
        <div>
          <div className="text-muted-foreground">{t('days_of_week')}</div>
          <div className="font-medium">{selectedDays}</div>
        </div>
        <div>
          <div className="text-muted-foreground">
            {t('start_time')} - {t('end_time')}
          </div>
          <div className="font-medium">
            {draft.startTime} - {draft.endTime}
          </div>
        </div>
        <div>
          <div className="text-muted-foreground">
            {t('quick_weekly_offset')}
          </div>
          <div className="font-medium">{preview.offsetLabel}</div>
        </div>
        <div>
          <div className="text-muted-foreground">{t('interval_weeks')}</div>
          <div className="font-medium">
            {t('quick_weekly_interval', { count: draft.intervalWeeks })}
          </div>
        </div>
        <div>
          <div className="text-muted-foreground">{t('until_date')}</div>
          <div className="font-medium">{draft.untilDate}</div>
        </div>
      </div>

      <div className="rounded-md border p-3">
        <div className="flex items-center justify-between gap-3">
          <div className="font-medium text-sm">
            {t('quick_weekly_first_dates')}
          </div>
          <div className="text-muted-foreground text-sm">
            {t('quick_weekly_session_count', { count: preview.count })}
          </div>
        </div>
        {preview.firstDates.length > 0 ? (
          <div className="mt-3 grid gap-2">
            {preview.firstDates.map((date) => (
              <div
                key={date.startsAt}
                className="flex items-center gap-2 rounded-md bg-muted/40 px-3 py-2 text-sm"
              >
                <CalendarDays className="h-4 w-4 text-dynamic-blue" />
                <span className="font-medium">{date.label}</span>
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
