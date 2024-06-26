'use client';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '../dialog';
import { ReactElement, ReactNode, cloneElement, useState } from 'react';

interface Props<T> {
  data?: T & { id?: string };
  trigger?: ReactNode;
  form?: ReactNode;
  open?: boolean;
  title?: string;
  editDescription?: string;
  createDescription?: string;
  requireExpansion?: boolean;
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
  requireExpansion,
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
        // onInteractOutside={(e) => e.preventDefault()}
        className={requireExpansion ? 'md:max-w-2xl xl:max-w-4xl' : undefined}
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
