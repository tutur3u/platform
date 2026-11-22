'use client';

import { useMutation } from '@tanstack/react-query';
import { createWorkspaceStorageFolder } from '@tuturuuu/internal-api';
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
import { toast } from '@tuturuuu/ui/sonner';
import { useTranslations } from 'next-intl';
import { type FormEvent, useId, useState } from 'react';

export function validateFolderName(name: string) {
  const trimmed = name.trim();
  if (!trimmed) return 'required';
  if (trimmed.includes('/') || trimmed === '.' || trimmed === '..') {
    return 'invalid';
  }
  return null;
}

export function DriveNewFolderDialog({
  folderLabel,
  onCreated,
  onOpenChange,
  open,
  path,
  wsId,
}: {
  folderLabel: string;
  onCreated: () => void | Promise<void>;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  path: string;
  wsId: string;
}) {
  const t = useTranslations('drive');
  const inputId = useId();
  const [name, setName] = useState('');
  const [touched, setTouched] = useState(false);
  const validation = validateFolderName(name);
  const mutation = useMutation({
    mutationFn: (folderName: string) =>
      createWorkspaceStorageFolder(
        wsId,
        { path: path || undefined, name: folderName },
        { fetch }
      ),
    onSuccess: async () => {
      toast.success(t('new_folder.created'));
      setName('');
      setTouched(false);
      onOpenChange(false);
      await onCreated();
    },
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setTouched(true);
    if (validation || mutation.isPending) return;
    mutation.mutate(name.trim());
  };
  const error = mutation.isError
    ? t('new_folder.failed')
    : touched && validation
      ? t(`new_folder.${validation}`)
      : null;

  return (
    <Dialog
      onOpenChange={(next) => {
        if (!mutation.isPending) onOpenChange(next);
      }}
      open={open}
    >
      <DialogContent className="sm:max-w-md">
        <form className="space-y-4" onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>{t('new_folder.title')}</DialogTitle>
            <DialogDescription>
              {t('new_folder.description', { folder: folderLabel })}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor={inputId}>{t('new_folder.name')}</Label>
            <Input
              aria-describedby={error ? `${inputId}-error` : undefined}
              aria-invalid={Boolean(error)}
              autoFocus
              id={inputId}
              maxLength={255}
              onChange={(event) => {
                setName(event.target.value);
                mutation.reset();
              }}
              value={name}
            />
            {error ? (
              <p className="text-destructive text-sm" id={`${inputId}-error`}>
                {error}
              </p>
            ) : null}
          </div>
          <DialogFooter>
            <Button
              disabled={mutation.isPending}
              onClick={() => onOpenChange(false)}
              type="button"
              variant="outline"
            >
              {t('common.cancel')}
            </Button>
            <Button disabled={mutation.isPending} type="submit">
              {mutation.isPending
                ? t('new_folder.creating')
                : t('new_folder.create')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
