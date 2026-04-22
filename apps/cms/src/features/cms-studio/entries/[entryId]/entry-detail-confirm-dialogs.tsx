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
  deleteEntryOpen: boolean;
  deleteMediaOpen: boolean;
  deleteEntryPending: boolean;
  deleteMediaPending: boolean;
  onDeleteEntry: () => void;
  onDeleteEntryOpenChange: (open: boolean) => void;
  onDeleteMedia: () => void;
  onDeleteMediaOpenChange: (open: boolean) => void;
  selectedAssetCount: number;
  strings: CmsStrings;
};

export function EntryDetailConfirmDialogs({
  deleteEntryOpen,
  deleteMediaOpen,
  deleteEntryPending,
  deleteMediaPending,
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
