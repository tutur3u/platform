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
import type { CmsStrings } from '../../cms-strings';

type EntryDetailConfirmDialogsProps = {
  discardChangesOpen: boolean;
  deleteEntryOpen: boolean;
  deleteMediaOpen: boolean;
  deleteEntryPending: boolean;
  deleteMediaPending: boolean;
  onDiscardChanges: () => void;
  onDiscardChangesOpenChange: (open: boolean) => void;
  onDeleteEntry: () => void;
  onDeleteEntryOpenChange: (open: boolean) => void;
  onDeleteMedia: () => void;
  onDeleteMediaOpenChange: (open: boolean) => void;
  selectedAssetCount: number;
  strings: CmsStrings;
};

export function EntryDetailConfirmDialogs({
  discardChangesOpen,
  deleteEntryOpen,
  deleteMediaOpen,
  deleteEntryPending,
  deleteMediaPending,
  onDiscardChanges,
  onDiscardChangesOpenChange,
  onDeleteEntry,
  onDeleteEntryOpenChange,
  onDeleteMedia,
  onDeleteMediaOpenChange,
  selectedAssetCount,
  strings,
}: EntryDetailConfirmDialogsProps) {
  return (
    <>
      <AlertDialog
        open={discardChangesOpen}
        onOpenChange={onDiscardChangesOpenChange}
      >
        <AlertDialogContent className="rounded-[1.5rem] border-border/70">
          <AlertDialogHeader>
            <AlertDialogTitle>{strings.discardChangesTitle}</AlertDialogTitle>
            <AlertDialogDescription>
              {strings.discardChangesDescription}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{strings.cancelAction}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={onDiscardChanges}
            >
              {strings.discardChangesAction}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={deleteEntryOpen}
        onOpenChange={onDeleteEntryOpenChange}
      >
        <AlertDialogContent className="rounded-[1.5rem] border-border/70">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {strings.deleteEntryConfirmTitle}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {strings.deleteEntryConfirmDescription}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{strings.cancelAction}</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleteEntryPending}
              onClick={onDeleteEntry}
            >
              {strings.deleteEntryAction}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={deleteMediaOpen}
        onOpenChange={onDeleteMediaOpenChange}
      >
        <AlertDialogContent className="rounded-[1.5rem] border-border/70">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {strings.deleteAssetConfirmTitle}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {strings.deleteAssetConfirmDescription}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{strings.cancelAction}</AlertDialogCancel>
            <AlertDialogAction
              disabled={selectedAssetCount === 0 || deleteMediaPending}
              onClick={onDeleteMedia}
            >
              {selectedAssetCount === 1
                ? strings.removeMediaAction
                : strings.bulkRemoveMediaAction}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
