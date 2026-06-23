'use client';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@tuturuuu/ui/dialog';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { HolidayForm } from './holiday-form';
import type { HolidayFormValues, HolidayManagementRow } from './types';

type HolidayFormDialogProps = {
  data?: HolidayManagementRow;
  isPending?: boolean;
  mode: 'create' | 'edit';
  onOpenChange?: (open: boolean) => void;
  onSubmit: (values: HolidayFormValues) => Promise<void> | void;
  open?: boolean;
  trigger?: ReactNode;
};

export function HolidayFormDialog({
  data,
  isPending,
  mode,
  onOpenChange,
  onSubmit,
  open,
  trigger,
}: HolidayFormDialogProps) {
  const t = useTranslations('admin-holidays');

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      {trigger ? <DialogTrigger asChild>{trigger}</DialogTrigger> : null}
      <DialogContent onOpenAutoFocus={(event) => event.preventDefault()}>
        <DialogHeader>
          <DialogTitle>
            {mode === 'create' ? t('add_holiday') : t('edit')}
          </DialogTitle>
          <DialogDescription>
            {mode === 'create'
              ? t('add_holiday_description')
              : t('add_holiday_description')}
          </DialogDescription>
        </DialogHeader>

        <HolidayForm
          data={data}
          isPending={isPending}
          key={data?.id ?? mode}
          mode={mode}
          onSubmit={onSubmit}
        />
      </DialogContent>
    </Dialog>
  );
}
