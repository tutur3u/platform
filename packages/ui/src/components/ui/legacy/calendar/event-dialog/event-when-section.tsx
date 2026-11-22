'use client';

import { Globe } from '@tuturuuu/icons';
import { DateTimePicker } from '@tuturuuu/ui/date-time-picker';
import { useCalendarPreferences } from '@tuturuuu/ui/hooks/use-calendar-preferences';
import { Switch } from '@tuturuuu/ui/switch';
import { useLocale, useTranslations } from 'next-intl';
import { type RefObject, useId } from 'react';
import { eventEndPickerBounds } from '../event-picker-bounds';
import { formatEventTimeZone } from './event-dialog-keys';

/**
 * Start and end, the all-day switch and the time zone the times are in. For an
 * all-day event the end picker shows the last day (the stored end is the next
 * midnight).
 */
export function EventWhenSection({
  startAt,
  endAt,
  isAllDay,
  timeZone,
  onStartChange,
  onEndChange,
  onAllDayChange,
  startPickerRef,
  endPickerRef,
}: {
  startAt?: string;
  endAt?: string;
  isAllDay: boolean;
  timeZone?: string;
  onStartChange: (date: Date | undefined) => void;
  onEndChange: (date: Date | undefined) => void;
  onAllDayChange: (checked: boolean) => void;
  startPickerRef: RefObject<HTMLButtonElement | null>;
  endPickerRef: RefObject<HTMLButtonElement | null>;
}) {
  const t = useTranslations('calendar.event_dialog');
  const locale = useLocale();
  const allDayId = useId();
  const preferences = useCalendarPreferences();
  const pickerPreferences = {
    weekStartsOn: preferences.weekStartsOn,
    timezone: preferences.timezone,
    timeFormat: preferences.timeFormat,
  };
  const start = new Date(startAt || Date.now());
  const end = (() => {
    const value = new Date(endAt || Date.now());
    if (isAllDay && endAt) value.setDate(value.getDate() - 1);
    return value;
  })();

  return (
    <div className="flex min-w-0 flex-col gap-2.5">
      <div className="grid gap-2 sm:grid-cols-2">
        <div role="group" aria-label={t('starts')} className="min-w-0">
          <span className="mb-1 block font-medium text-muted-foreground text-xs">
            {t('starts')}
          </span>
          <DateTimePicker
            date={start}
            setDate={onStartChange}
            showTimeSelect={!isAllDay}
            scrollIntoViewOnOpen
            pickerButtonRef={startPickerRef}
            preferences={pickerPreferences}
          />
        </div>
        <div role="group" aria-label={t('ends')} className="min-w-0">
          <span className="mb-1 block font-medium text-muted-foreground text-xs">
            {t('ends')}
          </span>
          <DateTimePicker
            date={end}
            setDate={onEndChange}
            showTimeSelect={!isAllDay}
            scrollIntoViewOnOpen
            pickerButtonRef={endPickerRef}
            preferences={pickerPreferences}
            {...eventEndPickerBounds(
              startAt || new Date().toISOString(),
              timeZone,
              isAllDay
            )}
          />
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-muted-foreground text-sm">
        <div className="flex items-center gap-2">
          <Switch
            id={allDayId}
            checked={isAllDay}
            onCheckedChange={onAllDayChange}
          />
          <label
            htmlFor={allDayId}
            className="cursor-pointer font-medium text-foreground"
          >
            {t('all_day')}
          </label>
        </div>
        <span className="inline-flex min-w-0 items-center gap-1.5">
          <Globe aria-hidden="true" className="size-3.5 shrink-0" />
          <span className="sr-only">{t('timezone')}</span>
          <span className="truncate">
            {formatEventTimeZone(timeZone, start, locale)}
          </span>
        </span>
      </div>
    </div>
  );
}
