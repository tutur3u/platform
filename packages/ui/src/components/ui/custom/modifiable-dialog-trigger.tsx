'use client';

import { cn } from '@tuturuuu/utils/format';
import {
  cloneElement,
  isValidElement,
  type ReactElement,
  type ReactNode,
  Suspense,
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

  setOpen?: (open: boolean) => void;
}

const REACT_LAZY_TYPE = Symbol.for('react.lazy');

interface LazyNode {
  $$typeof: symbol;
  _payload: unknown;
  _init: (payload: unknown) => unknown;
}

function isLazyNode(node: unknown): node is LazyNode {
  return (
    typeof node === 'object' &&
    node !== null &&
    (node as LazyNode).$$typeof === REACT_LAZY_TYPE
  );
}

/*
  A form element created in a Server Component reaches this client component
  through the RSC payload. While its client module is still loading, React
  Flight hands it over as a lazy node instead of an element, and cloning that
  node produces an element whose type is undefined (React error #130). The
  lazy node is unwrapped here first; a pending one suspends until its module
  loads.
*/
function DialogForm<T>({
  form,
  formProps,
}: {
  form: unknown;
  formProps: FormProps<T>;
}) {
  let node = form;
  while (isLazyNode(node)) node = node._init(node._payload);

  if (!isValidElement(node)) return null;
  return cloneElement(node as ReactElement<FormProps<T>>, formProps);
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

  const formWithCallback = form ? (
    <Suspense fallback={null}>
      <DialogForm
        form={form}
        formProps={{ data, forceDefault, onFinish: () => setOpen(false) }}
      />
    </Suspense>
  ) : null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogContent
        onOpenAutoFocus={(e) => e.preventDefault()}
        // onInteractOutside={(e) => e.preventDefault()}
        className={cn(
          'max-h-[85vh] overflow-y-auto',
          requireExpansion && 'md:max-w-2xl lg:max-w-4xl xl:max-w-6xl'
        )}
        onWheel={(e) => e.stopPropagation()}
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
