'use client';

import {
  cloneElement,
  type ReactElement,
  type ReactNode,
  useState,
} from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '../dialog';

interface FormProps<T> {
  data?: T;
  forceDefault?: boolean;
  onFinish?: () => void;
}

interface Props<T> {
  data?: T & { id?: string };
  trigger?: ReactNode;
  form?: ReactElement<FormProps<T>>;
  open?: boolean;
  title?: string;
  editDescription?: string;
  createDescription?: string;
  requireExpansion?: boolean;
  forceDefault?: boolean;
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
  forceDefault,
  setOpen: setExternalOpen,
}: Props<T>) {
  const [internalOpen, setInternalOpen] = useState(false);

  const open = externalOpen ?? internalOpen;
  const setOpen = setExternalOpen ?? setInternalOpen;

  const formWithCallback = form
    ? cloneElement(
        form as ReactElement,
        {
          data,
          forceDefault,
          onFinish: () => setOpen(false),
        } as FormProps<T>
      )
    : null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogContent
        onOpenAutoFocus={(e) => e.preventDefault()}
        // onInteractOutside={(e) => e.preventDefault()}
        className={
          requireExpansion
            ? 'md:max-w-2xl lg:max-w-4xl xl:max-w-6xl'
            : undefined
        }
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
