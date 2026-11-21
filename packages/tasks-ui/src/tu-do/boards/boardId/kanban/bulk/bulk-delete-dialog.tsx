'use client';

import { Button } from '@tuturuuu/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import { useState } from 'react';
import { useBulkOperationI18n } from './bulk-operation-i18n';

interface BulkDeleteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedCount: number;
  /** Closes the dialog itself; progress and Undo continue in a toast. */
  onConfirm: () => void | Promise<void>;
  isLoading: boolean;
}

export function BulkDeleteDialog({
  open,
  onOpenChange,
  selectedCount,
  onConfirm,
  isLoading,
}: BulkDeleteDialogProps) {
  const i18n = useBulkOperationI18n();
  // Confirming clears the selection while the dialog animates closed; keep
  // showing the count that was confirmed.
  const [shownCount, setShownCount] = useState(selectedCount);
  if (open && selectedCount > 0 && selectedCount !== shownCount) {
    setShownCount(selectedCount);
  }

  const handleConfirm = () => {
    // The mutation reports failures in its toast and rolls the board back.
    try {
      Promise.resolve(onConfirm()).catch(() => undefined);
    } catch {
      // Reported by the mutation as well.
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-105">
        <DialogHeader>
          <DialogTitle>{i18n.deleteConfirmTitle()}</DialogTitle>
          <DialogDescription>
            {i18n.deleteConfirmDescription(shownCount)}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {i18n.deleteConfirmCancel()}
          </Button>
          <Button
            variant="destructive"
            onClick={handleConfirm}
            disabled={isLoading || !open || selectedCount === 0}
          >
            {i18n.deleteConfirmAction()}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
