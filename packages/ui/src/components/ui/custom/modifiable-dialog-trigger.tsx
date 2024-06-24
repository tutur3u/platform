'use client';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@repo/ui/components/ui/dialog';
import React, { ReactElement, cloneElement, useState } from 'react';

interface Props<T> {
  data?: T & { id?: string };
  trigger?: React.ReactNode;
  form?: React.ReactNode;
  open?: boolean;
  title?: string;
  editDescription?: string;
  createDescription?: string;
  // eslint-disable-next-line no-unused-vars
  setOpen?: (open: boolean) => void;
}

export default function ModifiableDialogTrigger<T>({
  data,
  trigger,
  form,
  open: externalOpen,
  title,
  editDescription,
  createDescription,
  setOpen: setExternalOpen,
}: Props<T>) {
  const [internalOpen, setInternalOpen] = useState(false);

  const open = externalOpen ?? internalOpen;
  const setOpen = setExternalOpen ?? setInternalOpen;

  const formWithCallback = form
    ? cloneElement(form as ReactElement, {
        onFinish: () => setOpen(false),
      })
    : null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogContent
        onOpenAutoFocus={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {data?.id ? editDescription : createDescription}
          </DialogDescription>
        </DialogHeader>
        {formWithCallback}
      </DialogContent>
    </Dialog>
  );
}
