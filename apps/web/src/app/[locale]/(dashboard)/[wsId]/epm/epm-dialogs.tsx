'use client';

import type {
  ExternalProjectCollection,
  ExternalProjectEntry,
} from '@tuturuuu/types';
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
import { Button } from '@tuturuuu/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import type { EpmStrings } from './epm-strings';

export function EpmCreateCollectionDialog({
  createLabel,
  description,
  onConfirm,
  onDescriptionChange,
  onOpenChange,
  onTitleChange,
  open,
  pending,
  title,
  strings,
}: {
  createLabel: string;
  description: string;
  onConfirm: () => void;
  onDescriptionChange: (value: string) => void;
  onOpenChange: (open: boolean) => void;
  onTitleChange: (value: string) => void;
  open: boolean;
  pending: boolean;
  title: string;
  strings: EpmStrings;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{strings.createCollectionAction}</DialogTitle>
          <DialogDescription>
            {strings.manageCollectionDescription}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="epm-new-collection-title">
              {strings.titleLabel}
            </Label>
            <Input
              id="epm-new-collection-title"
              value={title}
              onChange={(event) => onTitleChange(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="epm-new-collection-description">
              {strings.descriptionLabel}
            </Label>
            <Input
              id="epm-new-collection-description"
              value={description}
              onChange={(event) => onDescriptionChange(event.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {strings.cancelAction}
          </Button>
          <Button disabled={pending} onClick={onConfirm}>
            {strings.createCollectionAction}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function EpmDeleteEntryDialog({
  candidate,
  onConfirm,
  onOpenChange,
  open,
  strings,
}: {
  candidate: ExternalProjectEntry | null;
  onConfirm: () => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  strings: EpmStrings;
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{strings.deleteEntryAction}</AlertDialogTitle>
          <AlertDialogDescription>
            {candidate?.title ?? strings.emptyEntries}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{strings.cancelAction}</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>
            {strings.deleteEntryAction}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function EpmDeleteCollectionDialog({
  candidate,
  onConfirm,
  onOpenChange,
  open,
  strings,
}: {
  candidate: ExternalProjectCollection | null;
  onConfirm: () => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  strings: EpmStrings;
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{strings.deleteCollectionAction}</AlertDialogTitle>
          <AlertDialogDescription>
            {candidate?.title ?? strings.emptyCollection}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{strings.cancelAction}</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>
            {strings.deleteCollectionAction}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
