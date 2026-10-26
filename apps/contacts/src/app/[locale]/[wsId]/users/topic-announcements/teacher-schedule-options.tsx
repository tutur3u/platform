'use client';

import { CalendarClock } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import { useTranslations } from 'next-intl';
import { MAX_SCHEDULE_DURATION_MINUTES } from './teacher-schedule-parser';

export function TeacherScheduleOptions({
  disabled,
  durationMinutes,
  onApplyDuration,
  onDurationChange,
  rowCount,
}: {
  disabled: boolean;
  durationMinutes: number;
  onApplyDuration: () => void;
  onDurationChange: (value: number) => void;
  rowCount: number;
}) {
  const t = useTranslations('ws-topic-announcements');

  return (
    <div className="flex flex-wrap items-end gap-3 rounded-md border border-dynamic-blue/20 bg-dynamic-blue/5 p-3">
      <div className="flex min-w-60 flex-1 items-start gap-2">
        <CalendarClock className="mt-0.5 h-4 w-4 text-dynamic-blue" />
        <div>
          <p className="font-medium text-sm">
            {t('schedule_import_detected', { count: rowCount.toString() })}
          </p>
          <p className="text-muted-foreground text-xs">
            {t('schedule_import_description')}
          </p>
        </div>
      </div>
      <div className="space-y-1">
        <Label htmlFor="topic-import-duration">
          {t('schedule_import_duration')}
        </Label>
        <Input
          className="h-9 w-28"
          disabled={disabled}
          id="topic-import-duration"
          max={MAX_SCHEDULE_DURATION_MINUTES}
          min={1}
          onChange={(event) => onDurationChange(Number(event.target.value))}
          type="number"
          value={durationMinutes}
        />
      </div>
      <Button
        disabled={disabled}
        onClick={onApplyDuration}
        size="sm"
        type="button"
        variant="outline"
      >
        {t('schedule_import_apply_duration')}
      </Button>
    </div>
  );
}
