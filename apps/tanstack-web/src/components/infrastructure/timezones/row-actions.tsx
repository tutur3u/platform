'use client';

import { Ellipsis } from '@tuturuuu/icons';
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
import { useState } from 'react';
import { TimezoneFormDialog } from './timezone-form-dialog';
import type {
  TimezoneManagementLabels,
  TimezoneManagementRow,
  TimezoneMutationPayload,
} from './types';

type TimezoneRowActionsProps = {
  isMutating?: boolean;
  labels: TimezoneManagementLabels;
  onDelete: (row: TimezoneManagementRow) => Promise<void> | void;
  onSync: (row: TimezoneManagementRow) => Promise<void> | void;
  onUpdate: (
    row: TimezoneManagementRow,
    payload: TimezoneMutationPayload
  ) => Promise<void> | void;
  row: TimezoneManagementRow;
};

export function TimezoneRowActions({
  isMutating,
  labels,
  onDelete,
  onSync,
  onUpdate,
  row,
}: TimezoneRowActionsProps) {
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const canEdit = Boolean(row.id);
  const canDelete = Boolean(row.id);

  return (
    <div className="flex items-center justify-end gap-2">
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button
            className="flex h-8 w-8 p-0 data-[state=open]:bg-muted"
            variant="ghost"
          >
            <Ellipsis className="h-4 w-4" />
            <span className="sr-only">Open menu</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-40">
          <DropdownMenuItem
            disabled={isMutating}
            onClick={() => {
              void onSync(row);
            }}
          >
            {row.id ? labels.actions.resync : labels.actions.sync}
          </DropdownMenuItem>

          {canEdit || canDelete ? <DropdownMenuSeparator /> : null}

          {canEdit ? (
            <DropdownMenuItem
              disabled={isMutating}
              onClick={() => setEditOpen(true)}
            >
              {labels.actions.edit}
            </DropdownMenuItem>
          ) : null}

          {canDelete ? (
            <DropdownMenuItem
              disabled={isMutating}
              onClick={() => setDeleteOpen(true)}
            >
              {labels.actions.delete}
            </DropdownMenuItem>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>

      {canEdit ? (
        <TimezoneFormDialog
          data={row}
          isPending={isMutating}
          labels={labels}
          mode="edit"
          onOpenChange={setEditOpen}
          onSubmit={async (payload) => {
            await onUpdate(row, payload);
            setEditOpen(false);
          }}
          open={editOpen}
        />
      ) : null}

      {canDelete ? (
        <Dialog onOpenChange={setDeleteOpen} open={deleteOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{labels.actions.deleteTitle}</DialogTitle>
              <DialogDescription>
                {labels.actions.deleteDescription}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button
                disabled={isMutating}
                onClick={() => setDeleteOpen(false)}
                variant="outline"
              >
                {labels.actions.cancel}
              </Button>
              <Button
                disabled={isMutating}
                onClick={async () => {
                  await onDelete(row);
                  setDeleteOpen(false);
                }}
                variant="destructive"
              >
                {labels.actions.delete}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : null}
    </div>
  );
}
