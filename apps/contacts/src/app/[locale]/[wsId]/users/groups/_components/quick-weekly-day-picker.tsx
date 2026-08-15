'use client';

import { CalendarDays } from '@tuturuuu/icons';
import { Checkbox } from '@tuturuuu/ui/checkbox';
import { Label } from '@tuturuuu/ui/label';
import { useTranslations } from 'next-intl';
import { SESSION_EDITOR_DAYS } from './session-editor-utils';

interface QuickWeeklyDayPickerProps {
  daysOfWeek: number[];
  onChange: (daysOfWeek: number[]) => void;
}

export function QuickWeeklyDayPicker({
  daysOfWeek,
  onChange,
}: QuickWeeklyDayPickerProps) {
  const t = useTranslations('ws-user-group-schedule');
  const commonT = useTranslations('common');
  const shortKeys = [
    'weekday_short.sunday',
    'weekday_short.monday',
    'weekday_short.tuesday',
    'weekday_short.wednesday',
    'weekday_short.thursday',
    'weekday_short.friday',
    'weekday_short.saturday',
  ] as const;

  return (
    <div className="space-y-2">
      <Label className="flex items-center gap-2">
        <CalendarDays className="h-3.5 w-3.5 text-muted-foreground" />
        {t('days_of_week')}
      </Label>
      <div className="grid grid-cols-4 gap-2 sm:grid-cols-7">
        {SESSION_EDITOR_DAYS.map((day) => (
          <label
            key={day.value}
            className="flex min-h-11 min-w-0 cursor-pointer items-center justify-center gap-1.5 rounded-lg border bg-background px-2 py-2 text-sm transition-colors hover:bg-muted/40 has-[[data-state=checked]]:border-dynamic-blue/50 has-[[data-state=checked]]:bg-dynamic-blue/10"
          >
            <Checkbox
              checked={daysOfWeek.includes(day.value)}
              onCheckedChange={(checked) =>
                onChange(
                  checked
                    ? Array.from(new Set([...daysOfWeek, day.value])).sort()
                    : daysOfWeek.filter((value) => value !== day.value)
                )
              }
            />
            <span className="sr-only">{commonT(day.labelKey)}</span>
            <span aria-hidden="true">{t(shortKeys[day.value])}</span>
          </label>
        ))}
      </div>
    </div>
  );
}
