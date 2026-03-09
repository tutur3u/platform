'use client';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@tuturuuu/ui/alert-dialog';
import type { ReactNode } from 'react';

interface DestructiveActionDialogProps {
  actionLabel: string;
  cancelLabel: string;
  children?: ReactNode;
  description: string;
  disabled?: boolean;
  isPending?: boolean;
  onOpenChange?: (open: boolean) => void;
  onConfirm: () => void;
  open?: boolean;
  title: string;
  trigger: ReactNode;
}

export function DestructiveActionDialog({
  actionLabel,
  cancelLabel,
  children,
  description,
  disabled = false,
  isPending = false,
  onOpenChange,
  onConfirm,
  open,
  title,
  trigger,
}: DestructiveActionDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogTrigger asChild disabled={disabled}>
        {trigger}
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        {children ? <div>{children}</div> : null}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>
            {cancelLabel}
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            disabled={isPending}
          >
            {actionLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
