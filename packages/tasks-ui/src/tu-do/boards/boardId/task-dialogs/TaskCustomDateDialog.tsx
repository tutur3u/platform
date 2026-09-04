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
import { CUSTOM_DATE_DIALOG_CLASS_NAMES } from '../../../shared/custom-date-picker/custom-date-dialog-layout';

// Default translations for when component is rendered outside NextIntlClientProvider
const defaultTranslations = {
  set_custom_due_date: 'Set Custom Due Date',
  custom_due_date_description: 'Select a specific date and time for this task.',
  cancel: 'Cancel',
  remove_due_date: 'Remove Due Date',
};

interface TaskCustomDateDialogProps {
  open: boolean;
  endDate: string | null;
  isLoading: boolean;
  onOpenChange: (open: boolean) => void;
  onDateChange: (date: Date | undefined) => void;
  onClear: () => void;
  /** Optional translations override for use in isolated React roots */
  translations?: {
    set_custom_due_date?: string;
    custom_due_date_description?: string;
    cancel?: string;
    remove_due_date?: string;
  };
}

export function TaskCustomDateDialog({
  open,
  endDate,
  isLoading,
  onOpenChange,
  onDateChange,
  onClear,
  translations,
}: TaskCustomDateDialogProps) {
  // Use provided translations or defaults
  const t = {
    set_custom_due_date:
      translations?.set_custom_due_date ??
      defaultTranslations.set_custom_due_date,
    custom_due_date_description:
      translations?.custom_due_date_description ??
      defaultTranslations.custom_due_date_description,
    cancel: translations?.cancel ?? defaultTranslations.cancel,
    remove_due_date:
      translations?.remove_due_date ?? defaultTranslations.remove_due_date,
  };

  const { weekStartsOn, timezone, timeFormat } = useCalendarPreferences();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={CUSTOM_DATE_DIALOG_CLASS_NAMES.content}>
        <DialogHeader className={CUSTOM_DATE_DIALOG_CLASS_NAMES.header}>
          <DialogTitle>{t.set_custom_due_date}</DialogTitle>
          <DialogDescription className="break-words">
            {t.custom_due_date_description}
          </DialogDescription>
        </DialogHeader>
        <div className={CUSTOM_DATE_DIALOG_CLASS_NAMES.body}>
          <DateTimePicker
            date={endDate ? new Date(endDate) : undefined}
            setDate={onDateChange}
            showTimeSelect={true}
            minDate={new Date()}
            inline
            preferences={{ weekStartsOn, timezone, timeFormat }}
          />
        </div>
        <DialogFooter className={CUSTOM_DATE_DIALOG_CLASS_NAMES.footer}>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isLoading}
          >
            {t.cancel}
          </Button>
          {endDate && (
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
              {t.remove_due_date}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
