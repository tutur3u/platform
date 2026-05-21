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
} from '@tuturuuu/ui/alert-dialog';
import type { SessionWithRelations } from '../../../../time-tracker/types';

interface DeleteSessionDialogProps {
  session: SessionWithRelations | null;
  onClose: () => void;
  onDelete: () => Promise<void>;
  isDeleting: boolean;
}

export function DeleteSessionDialog({
  session,
  onClose,
  onDelete,
  isDeleting,
}: DeleteSessionDialogProps) {
  return (
    <AlertDialog open={!!session} onOpenChange={() => onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete Time Session</AlertDialogTitle>
          <AlertDialogDescription>
            Are you sure you want to delete the session "{session?.title}"? This
            action cannot be undone and will permanently remove the tracked
            time.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={onDelete}
            disabled={isDeleting}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {isDeleting ? 'Deleting...' : 'Delete Session'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
