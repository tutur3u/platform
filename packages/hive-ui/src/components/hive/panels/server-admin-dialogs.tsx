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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import { useEffect, useState } from 'react';
import type { HiveServer } from '../../../engine/types';

type ServerFormPayload = Pick<
  HiveServer,
  'description' | 'enabled' | 'maxPlayers' | 'name'
>;

type ServerEditorDialogProps = {
  mode: 'create' | 'edit';
  onOpenChange: (open: boolean) => void;
  onSubmit: (payload: ServerFormPayload) => void;
  open: boolean;
  server?: HiveServer | null;
};

const DEFAULT_FORM: ServerFormPayload = {
  description: 'Shared Hive research world',
  enabled: true,
  maxPlayers: 32,
  name: 'Research Garden',
};

export function ServerEditorDialog({
  mode,
  onOpenChange,
  onSubmit,
  open,
  server,
}: ServerEditorDialogProps) {
  const [form, setForm] = useState<ServerFormPayload>(DEFAULT_FORM);

  useEffect(() => {
    if (!open) return;
    setForm(
      server
        ? {
            description: server.description,
            enabled: server.enabled,
            maxPlayers: server.maxPlayers,
            name: server.name,
          }
        : DEFAULT_FORM
    );
  }, [open, server]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="data-[state=closed]:slide-out-to-top-2 data-[state=open]:slide-in-from-top-2 z-[80] duration-300 sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {mode === 'create' ? 'Create Hive server' : 'Edit Hive server'}
          </DialogTitle>
          <DialogDescription>
            Servers own one shared world in Hive V1.
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            onSubmit(form);
            onOpenChange(false);
          }}
        >
          <label className="block space-y-1.5 text-sm">
            <span className="font-medium">Name</span>
            <input
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              onChange={(event) =>
                setForm((value) => ({ ...value, name: event.target.value }))
              }
              required
              value={form.name}
            />
          </label>
          <label className="block space-y-1.5 text-sm">
            <span className="font-medium">Description</span>
            <textarea
              className="min-h-24 w-full rounded-md border bg-background px-3 py-2 text-sm"
              onChange={(event) =>
                setForm((value) => ({
                  ...value,
                  description: event.target.value || null,
                }))
              }
              value={form.description ?? ''}
            />
          </label>
          <div className="grid grid-cols-[1fr_auto] items-end gap-3">
            <label className="block space-y-1.5 text-sm">
              <span className="font-medium">Max players</span>
              <input
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                max={256}
                min={1}
                onChange={(event) =>
                  setForm((value) => ({
                    ...value,
                    maxPlayers: Number(event.target.value),
                  }))
                }
                type="number"
                value={form.maxPlayers}
              />
            </label>
            <label className="flex h-10 items-center gap-2 rounded-md border px-3 text-sm">
              <input
                checked={form.enabled}
                onChange={(event) =>
                  setForm((value) => ({
                    ...value,
                    enabled: event.target.checked,
                  }))
                }
                type="checkbox"
              />
              Enabled
            </label>
          </div>
          <DialogFooter>
            <button
              className="rounded-md border px-4 py-2 text-sm"
              onClick={() => onOpenChange(false)}
              type="button"
            >
              Cancel
            </button>
            <button
              className="rounded-md bg-dynamic-green px-4 py-2 font-medium text-background text-sm"
              type="submit"
            >
              {mode === 'create' ? 'Create' : 'Save'}
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

type ConfirmActionDialogProps = {
  description: string;
  onConfirm: () => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  title: string;
};

export function ConfirmActionDialog({
  description,
  onConfirm,
  onOpenChange,
  open,
  title,
}: ConfirmActionDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="data-[state=closed]:slide-out-to-top-2 data-[state=open]:slide-in-from-top-2 z-[80] duration-300">
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>Continue</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
