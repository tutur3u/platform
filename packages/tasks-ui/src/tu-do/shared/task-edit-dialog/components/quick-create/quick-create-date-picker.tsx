'use client';

import { X } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { DateTimePicker } from '@tuturuuu/ui/date-time-picker';
import { useCalendarPreferences } from '@tuturuuu/ui/hooks/use-calendar-preferences';
import { useTranslations } from 'next-intl';
import { getDaysUntilEndOfWeek } from './quick-create-values';

interface QuickCreateDatePickerProps {
  date: Date | undefined;
  minDate?: Date;
  maxDate?: Date;
  onChange: (date: Date | undefined) => void;
  /** Due dates offer Today / Tomorrow / This week / Next week shortcuts. */
  onQuickPick?: (days: number) => void;
}

/** The Start and Due picker body: the shared inline calendar plus shortcuts. */
export function QuickCreateDatePicker({
  date,
  minDate,
  maxDate,
  onChange,
  onQuickPick,
}: QuickCreateDatePickerProps) {
  const t = useTranslations();
  const { weekStartsOn, timezone, timeFormat } = useCalendarPreferences();
  const daysUntilEndOfWeek = getDaysUntilEndOfWeek(weekStartsOn);
  const quickPicks = [
    { days: 0, label: t('common.today') },
    { days: 1, label: t('common.tomorrow') },
    { days: daysUntilEndOfWeek, label: t('common.this_week') },
    { days: daysUntilEndOfWeek + 7, label: t('common.next_week') },
  ];

  return (
    <div className="flex flex-col">
      {onQuickPick ? (
        <div className="grid grid-cols-2 gap-1 border-b p-1">
          {quickPicks.map((pick) => (
            <Button
              key={pick.label}
              type="button"
              variant="ghost"
              size="sm"
              className="justify-start"
              onClick={() => onQuickPick(pick.days)}
            >
              {pick.label}
            </Button>
          ))}
        </div>
      ) : null}
      <div className="p-1 [&>div]:border-0">
        <DateTimePicker
          inline
          date={date}
          setDate={onChange}
          showTimeSelect
          allowClear
          minDate={minDate}
          maxDate={maxDate}
          preferences={{ weekStartsOn, timezone, timeFormat }}
        />
      </div>
      {date ? (
        <div className="border-t p-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="w-full justify-start text-muted-foreground"
            onClick={() => onChange(undefined)}
          >
            <X aria-hidden="true" className="size-4" />
            {t('ws-task-boards.dialog.quick_create.clear')}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
