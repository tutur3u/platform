'use client';

import { AlertTriangle, FileWarning } from '@tuturuuu/icons';
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

interface DescriptionOverflowWarningDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirmClose: () => void;
  title: string;
  description: string;
  cancelLabel: string;
  confirmLabel: string;
}

export function DescriptionOverflowWarningDialog({
  open,
  onOpenChange,
  onConfirmClose,
  title,
  description,
  cancelLabel,
  confirmLabel,
}: DescriptionOverflowWarningDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-dynamic-yellow/10 text-dynamic-yellow">
              <FileWarning className="h-5 w-5" />
            </div>
            <div className="space-y-1">
              <AlertDialogTitle>{title}</AlertDialogTitle>
              <AlertDialogDescription>{description}</AlertDialogDescription>
            </div>
          </div>
        </AlertDialogHeader>
        <div className="rounded-md border border-dynamic-yellow/30 bg-dynamic-yellow/5 px-3 py-2">
          <div className="flex items-center gap-2 text-dynamic-yellow text-xs">
            <AlertTriangle className="h-4 w-4" />
            <span>Oversized content will be discarded if you close now.</span>
          </div>
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel>{cancelLabel}</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirmClose}
            className="bg-dynamic-red text-white hover:bg-dynamic-red/90"
          >
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
