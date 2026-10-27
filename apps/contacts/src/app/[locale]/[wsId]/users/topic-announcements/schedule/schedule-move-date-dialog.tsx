'use client';

import { Button } from '@tuturuuu/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import { scheduleMonthRange } from '@tuturuuu/utils/topic-schedule';
import { useTranslations } from 'next-intl';
import { useId, useState } from 'react';

/** Moves one session to another day of the same month. */
export function ScheduleMoveDateDialog({
  date,
  month,
  onClose,
  onMove,
}: {
  date: string;
  month: string;
  onClose: () => void;
  onMove: (date: string) => void;
}) {
  const t = useTranslations('ws-topic-announcements');
  const inputId = useId();
  const range = scheduleMonthRange(month);
  const [value, setValue] = useState(date);
  const valid = value >= range.start && value <= range.end;

  return (
    <Dialog onOpenChange={(open) => (open ? null : onClose())} open>
      <DialogContent className="sm:max-w-sm">
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (valid) onMove(value);
          }}
        >
          <DialogHeader>
            <DialogTitle>{t('schedule_move_date_title')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor={inputId}>{t('schedule_column_date')}</Label>
            <Input
              id={inputId}
              max={range.end}
              min={range.start}
              onChange={(event) => setValue(event.target.value)}
              type="date"
              value={value}
            />
          </div>
          <DialogFooter>
            <Button onClick={onClose} type="button" variant="ghost">
              {t('schedule_cancel')}
            </Button>
            <Button disabled={!valid || value === date} type="submit">
              {t('schedule_move_date_confirm')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
