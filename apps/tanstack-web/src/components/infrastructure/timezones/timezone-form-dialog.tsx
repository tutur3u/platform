'use client';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@tuturuuu/ui/dialog';
import type { ReactNode } from 'react';
import { TimezoneForm } from './timezone-form';
import type {
  TimezoneManagementLabels,
  TimezoneManagementRecord,
  TimezoneMutationPayload,
} from './types';

type TimezoneFormDialogProps = {
  data?: TimezoneManagementRecord;
  isPending?: boolean;
  labels: TimezoneManagementLabels;
  mode: 'create' | 'edit';
  onOpenChange?: (open: boolean) => void;
  onSubmit: (payload: TimezoneMutationPayload) => Promise<void> | void;
  open?: boolean;
  trigger?: ReactNode;
};

export function TimezoneFormDialog({
  data,
  isPending,
  labels,
  mode,
  onOpenChange,
  onSubmit,
  open,
  trigger,
}: TimezoneFormDialogProps) {
  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      {trigger ? <DialogTrigger asChild>{trigger}</DialogTrigger> : null}
      <DialogContent
        className="max-h-[85vh] overflow-y-auto sm:max-w-2xl"
        onOpenAutoFocus={(event) => event.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>
            {mode === 'create'
              ? labels.dialog.createTitle
              : labels.dialog.editTitle}
          </DialogTitle>
          <DialogDescription>
            {mode === 'create'
              ? labels.dialog.createDescription
              : labels.dialog.editDescription}
          </DialogDescription>
        </DialogHeader>

        <TimezoneForm
          data={data}
          isPending={isPending}
          labels={labels}
          onSubmit={onSubmit}
        />
      </DialogContent>
    </Dialog>
  );
}
