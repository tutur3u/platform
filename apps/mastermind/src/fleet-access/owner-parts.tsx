import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@tuturuuu/ui/alert-dialog';
import { buttonVariants } from '@tuturuuu/ui/button';
import { Checkbox } from '@tuturuuu/ui/checkbox';
import { Label } from '@tuturuuu/ui/label';
import type { ReactNode } from 'react';
import type { OwnerRefusal, OwnerWrite } from './owner-upstream';
import { useFleetText } from './text';

export function OwnerSection({
  id,
  title,
  actions,
  children,
}: {
  id: string;
  title: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section aria-labelledby={`${id}-title`} className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2
          id={`${id}-title`}
          className="font-semibold text-base tracking-tight"
        >
          {title}
        </h2>
        {actions}
      </div>
      {children}
    </section>
  );
}

/** The app's own confirmation step; never a native browser dialog. */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  action,
  destructive,
  onConfirm,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  action: string;
  destructive?: boolean;
  onConfirm: () => void;
  children: ReactNode;
}) {
  const { t } = useFleetText();
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3 text-muted-foreground text-sm">
              {children}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t.access.cancel}</AlertDialogCancel>
          <AlertDialogAction
            className={
              destructive
                ? buttonVariants({ variant: 'destructive' })
                : undefined
            }
            onClick={onConfirm}
          >
            {action}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/** The outcome of one Owner change, as a discriminated state. */
export type ChangeState =
  | { kind: 'idle' }
  | { kind: 'saving' }
  | { kind: 'done'; message: string }
  | { kind: 'refused'; reason: OwnerRefusal };

export function changeState<T>(
  mutation: {
    isPending: boolean;
    isError: boolean;
    data: OwnerWrite<T> | undefined;
  },
  done: (data: T) => string
): ChangeState {
  if (mutation.isPending) return { kind: 'saving' };
  if (mutation.isError) return { kind: 'refused', reason: 'unavailable' };
  if (!mutation.data) return { kind: 'idle' };
  return mutation.data.kind === 'ok'
    ? { kind: 'done', message: done(mutation.data.data) }
    : { kind: 'refused', reason: mutation.data.reason };
}

export function ChangeNotice({ state }: { state: ChangeState }) {
  const { t } = useFleetText();
  switch (state.kind) {
    case 'idle':
    case 'saving':
      return null;
    case 'done':
      return (
        <output className="text-muted-foreground text-sm">
          {state.message}
        </output>
      );
    case 'refused':
      return (
        <p role="alert" className="text-destructive text-sm">
          {t.ownerRefusal[state.reason]}
        </p>
      );
  }
}

export function CheckboxGroup<T extends string>({
  id,
  legend,
  options,
  values,
  onChange,
  error,
}: {
  id: string;
  legend: string;
  options: readonly { value: T; label: string }[];
  values: readonly T[];
  onChange: (value: T, checked: boolean) => void;
  error?: string;
}) {
  return (
    <fieldset
      id={id}
      tabIndex={-1}
      aria-invalid={error ? true : undefined}
      aria-describedby={error ? `${id}-error` : undefined}
      className="space-y-2"
    >
      <legend className="font-medium text-sm">{legend}</legend>
      <div className="grid gap-2 sm:grid-cols-2">
        {options.map((option) => (
          <div key={option.value} className="flex items-center gap-2">
            <Checkbox
              id={`${id}-${option.value}`}
              checked={values.includes(option.value)}
              onCheckedChange={(checked) =>
                onChange(option.value, checked === true)
              }
            />
            <Label
              htmlFor={`${id}-${option.value}`}
              className="font-normal text-sm"
            >
              {option.label}
            </Label>
          </div>
        ))}
      </div>
      {error && (
        <p id={`${id}-error`} className="text-destructive text-sm">
          {error}
        </p>
      )}
    </fieldset>
  );
}
