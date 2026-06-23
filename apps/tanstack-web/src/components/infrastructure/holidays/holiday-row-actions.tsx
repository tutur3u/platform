'use client';

import { Ellipsis, Trash2 } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
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
import { HolidayFormDialog } from './holiday-form-dialog';
import type {
  HolidayFormValues,
  HolidayManagementRow,
  HolidayUpdateValues,
} from './types';

type HolidayRowActionsProps = {
  isMutating?: boolean;
  onDelete: (holidayId: string) => Promise<void> | void;
  onUpdate: (
    holidayId: string,
    values: HolidayUpdateValues
  ) => Promise<void> | void;
  row: HolidayManagementRow;
};

export function HolidayRowActions({
  isMutating,
  onDelete,
  onUpdate,
  row,
}: HolidayRowActionsProps) {
  const t = useTranslations('admin-holidays');
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);

  const handleUpdate = async (values: HolidayFormValues) => {
    await onUpdate(row.id, values);
    setEditOpen(false);
  };

  return (
    <div className="flex items-center justify-end gap-2">
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button
            className="flex h-8 w-8 p-0 data-[state=open]:bg-muted"
            disabled={isMutating}
            variant="ghost"
          >
            <Ellipsis className="h-4 w-4" />
            <span className="sr-only">{t('actions')}</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-36">
          <DropdownMenuItem
            disabled={isMutating}
            onClick={() => setEditOpen(true)}
          >
            {t('edit')}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            disabled={isMutating}
            onClick={() => setDeleteOpen(true)}
          >
            <Trash2 className="h-4 w-4" />
            {t('delete')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <HolidayFormDialog
        data={row}
        isPending={isMutating}
        mode="edit"
        onOpenChange={setEditOpen}
        onSubmit={handleUpdate}
        open={editOpen}
      />

      <Dialog onOpenChange={setDeleteOpen} open={deleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('delete_holiday')}</DialogTitle>
            <DialogDescription>
              {t('delete_confirm', { name: row.name })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              disabled={isMutating}
              onClick={() => setDeleteOpen(false)}
              variant="outline"
            >
              {t('cancel')}
            </Button>
            <Button
              disabled={isMutating}
              onClick={async () => {
                await onDelete(row.id);
                setDeleteOpen(false);
              }}
              variant="destructive"
            >
              {isMutating ? t('deleting') : t('delete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
