'use client';

import { TriangleAlert } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';

interface ExperimentalFeatureDialogProps {
  open: boolean;
  onConfirm: () => void;
  onClose?: () => void;
}

export function ExperimentalFeatureDialog({
  open,
  onConfirm,
  onClose,
}: ExperimentalFeatureDialogProps) {
  const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen) {
      onClose?.();
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent onInteractOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <TriangleAlert className="h-5 w-5" />
            Experimental Feature
          </DialogTitle>
          <DialogDescription className="pt-2">
            Smart scheduling is enabled for testing. This feature is very
            experimental and could result in unexpected behaviors.
            <br />
            <br />
            Not stable enough for production use, only for experimentation and
            testing purposes only.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="destructive" onClick={onConfirm}>
            I understand, proceed anyway
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
