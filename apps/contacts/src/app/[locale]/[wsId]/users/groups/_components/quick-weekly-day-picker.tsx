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

  return (
    <div className="space-y-2 sm:col-span-2">
      <Label className="flex items-center gap-2">
        <CalendarDays className="h-3.5 w-3.5 text-muted-foreground" />
        {t('days_of_week')}
      </Label>
      <div className="flex flex-wrap gap-2">
        {SESSION_EDITOR_DAYS.map((day) => (
          <label
            key={day.value}
            className="flex items-center gap-2 rounded-md border px-2 py-1 text-sm"
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
            {commonT(day.labelKey)}
          </label>
        ))}
      </div>
    </div>
  );
}
