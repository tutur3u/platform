'use client';

import { AlertTriangle } from '@tuturuuu/icons';
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
  trigger?: ReactNode;
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
      {trigger ? (
        <AlertDialogTrigger asChild disabled={disabled}>
          {trigger}
        </AlertDialogTrigger>
      ) : null}
      <AlertDialogContent className="rounded-[1.75rem] border-border/60">
        <AlertDialogHeader>
          <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-2xl border border-destructive/20 bg-destructive/8 text-destructive">
            <AlertTriangle className="h-5 w-5" />
          </div>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        {children ? (
          <div className="rounded-2xl border border-border/60 bg-muted/20">
            {children}
          </div>
        ) : null}
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
