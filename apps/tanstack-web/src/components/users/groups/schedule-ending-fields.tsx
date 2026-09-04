'use client';

import { CalendarDays, Repeat } from '@tuturuuu/icons';
import { DateTimePicker } from '@tuturuuu/ui/date-time-picker';
import { Label } from '@tuturuuu/ui/label';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import {
  pickerDateFromParts,
  pickerPartsFromDate,
  type ScheduleEndMode,
} from './quick-weekly-schedule-utils';

interface ScheduleEndingFieldsProps {
  endMode: ScheduleEndMode;
  onChange: (value: { endMode: ScheduleEndMode; untilDate: string }) => void;
  timezone: string;
  untilDate: string;
}

export function ScheduleEndingFields({
  endMode,
  onChange,
  timezone,
  untilDate,
}: ScheduleEndingFieldsProps) {
  const t = useTranslations('ws-user-group-schedule');

  return (
    <div className="space-y-2 md:col-span-2">
      <Label>{t('schedule_ends')}</Label>
      <div className="grid gap-2 sm:grid-cols-2">
        {(['never', 'date'] as const).map((mode) => {
          const Icon = mode === 'never' ? Repeat : CalendarDays;
          return (
            <button
              key={mode}
              aria-pressed={endMode === mode}
              className={cn(
                'flex min-h-16 items-start gap-3 rounded-xl border bg-background p-3 text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                endMode === mode && 'border-dynamic-blue/60 bg-dynamic-blue/10'
              )}
              type="button"
              onClick={() => onChange({ endMode: mode, untilDate })}
            >
              <Icon className="mt-0.5 h-4 w-4 shrink-0 text-dynamic-blue" />
              <span>
                <span className="block font-medium text-sm">
                  {t(mode === 'never' ? 'repeat_forever' : 'end_on_date')}
                </span>
                {mode === 'never' ? (
                  <span className="mt-0.5 block text-muted-foreground text-xs">
                    {t('repeat_forever_help')}
                  </span>
                ) : null}
              </span>
            </button>
          );
        })}
      </div>
      {endMode === 'date' ? (
        <div className="pt-1">
          <DateTimePicker
            allowClear={false}
            date={pickerDateFromParts(untilDate, '00:00', timezone)}
            preferences={{
              timeFormat: '24h',
              timezone,
              weekStartsOn: 1,
            }}
            setDate={(value) => {
              if (!value) return;
              onChange({
                endMode,
                untilDate: pickerPartsFromDate(value, timezone).date,
              });
            }}
            showTimeSelect={false}
          />
        </div>
      ) : null}
    </div>
  );
}
