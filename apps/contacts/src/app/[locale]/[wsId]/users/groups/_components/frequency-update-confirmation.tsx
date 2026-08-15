'use client';

import { ArrowRight, CalendarDays, Check, Plus, Trash2 } from '@tuturuuu/icons';
import { ScrollArea } from '@tuturuuu/ui/scroll-area';
import dayjs from 'dayjs';
import { useTranslations } from 'next-intl';
import type {
  FrequencyPreviewEntry,
  FrequencySeriesOption,
  FrequencyUpdateDraft,
  FrequencyUpdatePreview,
} from './frequency-update-utils';
import { SESSION_EDITOR_DAYS } from './session-editor-utils';

function ChangeList({
  entries,
  kind,
}: {
  entries: FrequencyPreviewEntry[];
  kind: 'added' | 'adjusted' | 'kept' | 'removed';
}) {
  const t = useTranslations('ws-user-group-schedule');
  const Icon =
    kind === 'removed'
      ? Trash2
      : kind === 'added'
        ? Plus
        : kind === 'kept'
          ? Check
          : ArrowRight;

  return (
    <section className="space-y-2">
      <h4 className="flex items-center gap-2 font-medium text-sm">
        <Icon className="h-4 w-4" />
        {t(`frequency_${kind}_dates`, { count: entries.length })}
      </h4>
      {entries.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          {t('frequency_no_dates')}
        </p>
      ) : (
        <div className="space-y-1.5">
          {entries.map((entry) => (
            <div
              key={entry.date}
              className="rounded-lg border bg-background px-3 py-2 text-sm"
            >
              {entry.beforeLabel && entry.afterLabel ? (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-muted-foreground line-through">
                    {entry.beforeLabel}
                  </span>
                  <ArrowRight className="h-3.5 w-3.5" />
                  <span className="font-medium">{entry.afterLabel}</span>
                </div>
              ) : (
                <span className="font-medium">{entry.label}</span>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

export function FrequencyUpdateConfirmation({
  draft,
  option,
  preview,
}: {
  draft: FrequencyUpdateDraft;
  option: FrequencySeriesOption;
  preview: FrequencyUpdatePreview;
}) {
  const t = useTranslations('ws-user-group-schedule');
  const commonT = useTranslations('common');
  const currentDays = option.firstSession.recurrence?.daysOfWeek ?? [];
  const formatDays = (days: number[]) =>
    SESSION_EDITOR_DAYS.filter((day) => days.includes(day.value))
      .map((day) => commonT(day.labelKey))
      .join(', ');
  const startsAt = dayjs(option.firstSession.startsAt).tz(
    option.firstSession.startTimezone
  );
  const endsAt = dayjs(option.firstSession.endsAt).tz(
    option.firstSession.endTimezone
  );

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          ['removed', preview.removed.length, 'text-dynamic-red'],
          ['added', preview.added.length, 'text-dynamic-blue'],
          ['adjusted', preview.adjusted.length, 'text-dynamic-orange'],
          ['kept', preview.kept.length, 'text-dynamic-green'],
        ].map(([key, count, className]) => (
          <div key={key} className="rounded-xl border bg-muted/20 p-3">
            <div className={`font-semibold text-2xl ${className}`}>{count}</div>
            <div className="text-muted-foreground text-xs">
              {t(`frequency_${key}`)}
            </div>
          </div>
        ))}
      </div>

      <div className="grid gap-3 rounded-xl border bg-muted/20 p-4 text-sm sm:grid-cols-2">
        <div>
          <div className="text-muted-foreground">
            {t('frequency_current_pattern')}
          </div>
          <div className="font-medium">
            {formatDays(currentDays)} ·{' '}
            {t('quick_weekly_interval', {
              count: option.firstSession.recurrence?.intervalWeeks ?? 1,
            })}
          </div>
        </div>
        <div>
          <div className="text-muted-foreground">
            {t('frequency_new_pattern')}
          </div>
          <div className="font-medium">
            {formatDays(draft.daysOfWeek)} ·{' '}
            {t('quick_weekly_interval', { count: draft.intervalWeeks })}
          </div>
        </div>
        <div>
          <div className="text-muted-foreground">
            {t('frequency_time_and_timezone')}
          </div>
          <div className="font-medium">
            {startsAt.format('HH:mm')} - {endsAt.format('HH:mm')} ·{' '}
            {option.firstSession.startTimezone}
          </div>
        </div>
        <div>
          <div className="text-muted-foreground">
            {t('frequency_effective_from')}
          </div>
          <div className="font-medium">{preview.effectiveDate}</div>
        </div>
        <div>
          <div className="text-muted-foreground">{t('schedule_ends')}</div>
          <div className="font-medium">
            {preview.untilDate ?? t('repeat_forever')}
          </div>
        </div>
        <div className="flex gap-2 sm:col-span-2">
          <Check className="mt-0.5 h-4 w-4 text-dynamic-green" />
          <span>{t('frequency_history_unchanged')}</span>
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center gap-2 font-medium text-sm">
          <CalendarDays className="h-4 w-4" />
          {t('frequency_complete_change_list')}
        </div>
        {draft.endMode === 'never' ? (
          <p className="text-muted-foreground text-xs">
            {t('frequency_preview_horizon', {
              date: preview.previewUntilDate,
            })}
          </p>
        ) : null}
        <ScrollArea className="h-64 rounded-xl border bg-muted/10 p-4">
          <div className="space-y-5 pr-3">
            <ChangeList entries={preview.removed} kind="removed" />
            <ChangeList entries={preview.added} kind="added" />
            <ChangeList entries={preview.adjusted} kind="adjusted" />
            <ChangeList entries={preview.kept} kind="kept" />
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}
