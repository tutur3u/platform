'use client';

import { X } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { DateTimePicker } from '@tuturuuu/ui/date-time-picker';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import { useCalendarPreferences } from '@tuturuuu/ui/hooks/use-calendar-preferences';
import { useTranslations } from 'next-intl';

interface BulkCustomDateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDateChange: (date: Date | undefined) => void;
  onClear: () => void;
  isLoading: boolean;
}

export function BulkCustomDateDialog({
  open,
  onOpenChange,
  onDateChange,
  onClear,
  isLoading,
}: BulkCustomDateDialogProps) {
  const t = useTranslations();
  const { weekStartsOn, timezone, timeFormat } = useCalendarPreferences();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-106.25">
        <DialogHeader>
          <DialogTitle>
            {t('ws-task-boards.bulk.set_custom_due_date')}
          </DialogTitle>
          <DialogDescription>
            {t('ws-task-boards.bulk.set_custom_due_date_description')}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <DateTimePicker
            date={undefined}
            setDate={onDateChange}
            showTimeSelect={true}
            minDate={new Date()}
            inline
            preferences={{ weekStartsOn, timezone, timeFormat }}
          />
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isLoading}
          >
            {t('common.cancel')}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              onClear();
              onOpenChange(false);
            }}
            disabled={isLoading}
            className="text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
            {t('common.remove_due_date')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
