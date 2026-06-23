'use client';

import { Ellipsis } from '@tuturuuu/icons';
import type { BackendInfrastructureEmailBlacklistEntry } from '@tuturuuu/internal-api/backend';
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
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@tuturuuu/ui/dropdown-menu';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import EmailBlacklistForm, { type EmailBlacklistUpdateValues } from './form';

export type EmailBlacklistRowActionHandlers = {
  isDeleting?: boolean;
  isMutating?: boolean;
  onDelete: (entryId: string) => Promise<void> | void;
  onUpdate: (
    entryId: string,
    values: EmailBlacklistUpdateValues
  ) => Promise<void> | void;
};

type EmailBlacklistRowActionsProps = EmailBlacklistRowActionHandlers & {
  row: BackendInfrastructureEmailBlacklistEntry;
};

export function EmailBlacklistRowActions({
  isDeleting,
  isMutating,
  onDelete,
  onUpdate,
  row,
}: EmailBlacklistRowActionsProps) {
  const t = useTranslations();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);

  return (
    <div className="flex items-center justify-end gap-2">
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button
            className="flex h-8 w-8 p-0 data-[state=open]:bg-muted"
            variant="ghost"
          >
            <Ellipsis className="h-4 w-4" />
            <span className="sr-only">{t('common.actions')}</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-40">
          <DropdownMenuItem
            disabled={isMutating}
            onClick={() => setEditOpen(true)}
          >
            {t('common.edit')}
          </DropdownMenuItem>

          <DropdownMenuSeparator />

          <DropdownMenuItem
            className="text-destructive focus:text-destructive"
            disabled={!row.id || isMutating}
            onClick={() => setDeleteOpen(true)}
          >
            {isDeleting ? t('common.deleting') : t('common.delete')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog onOpenChange={setEditOpen} open={editOpen}>
        <DialogContent
          className="max-h-[85vh] overflow-y-auto sm:max-w-2xl"
          onOpenAutoFocus={(event) => event.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle>{t('email-blacklist.edit-entry')}</DialogTitle>
            <DialogDescription>
              {t('email-blacklist.edit-entry-description')}
            </DialogDescription>
          </DialogHeader>

          <EmailBlacklistForm
            data={row}
            isPending={isMutating}
            onFinish={() => setEditOpen(false)}
            onUpdate={onUpdate}
          />
        </DialogContent>
      </Dialog>

      <AlertDialog onOpenChange={setDeleteOpen} open={deleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('common.delete')} {t('email-blacklist.singular')}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t('common.confirm_delete_description')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>
              {t('common.cancel')}
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={!row.id || isDeleting}
              onClick={() => {
                void onDelete(row.id);
              }}
            >
              {isDeleting ? t('common.deleting') : t('common.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
