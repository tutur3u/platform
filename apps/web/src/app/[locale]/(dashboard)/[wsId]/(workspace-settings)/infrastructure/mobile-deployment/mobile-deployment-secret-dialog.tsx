'use client';

import { KeyRound } from '@tuturuuu/icons';
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
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

export interface SecretDialogState {
  description: string;
  name: string;
  nameEditable: boolean;
  previousName?: string;
  title: string;
}

export function MobileDeploymentSecretDialog({
  onOpenChange,
  onSave,
  open,
  pending,
  state,
}: {
  onOpenChange: (open: boolean) => void;
  onSave: (payload: {
    name: string;
    previousName?: string;
    value: string;
  }) => Promise<void> | void;
  open: boolean;
  pending: boolean;
  state: SecretDialogState | null;
}) {
  const t = useTranslations('mobile-deployment-settings');
  const [name, setName] = useState('');
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setName('');
      setValue('');
      setError(null);
      return;
    }

    setName(state?.name ?? '');
    setValue('');
    setError(null);
  }, [open, state]);

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      setName('');
      setValue('');
      setError(null);
    }
    onOpenChange(nextOpen);
  };

  if (!state) {
    return null;
  }

  const currentName = name;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{state.title}</DialogTitle>
          <DialogDescription>{state.description}</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="mobile-deployment-secret-name">{t('name')}</Label>
            <Input
              className="font-mono"
              disabled={!state.nameEditable || pending}
              id="mobile-deployment-secret-name"
              onChange={(event) => {
                setError(null);
                setName(event.target.value);
              }}
              placeholder={t('secretNamePlaceholder')}
              value={currentName}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="mobile-deployment-secret-value">{t('value')}</Label>
            <Input
              autoComplete="off"
              id="mobile-deployment-secret-value"
              onChange={(event) => {
                setError(null);
                setValue(event.target.value);
              }}
              placeholder={t('secretValuePlaceholder')}
              disabled={pending}
              type="password"
              value={value}
            />
          </div>
          {error && (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-destructive text-sm">
              <div className="font-medium">{t('error')}</div>
              <div>{error}</div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            disabled={pending}
            onClick={() => handleOpenChange(false)}
            type="button"
            variant="outline"
          >
            {t('cancel')}
          </Button>
          <Button
            disabled={!currentName.trim() || !value || pending}
            onClick={async () => {
              try {
                await onSave({
                  name: currentName,
                  previousName: state.previousName,
                  value,
                });
                handleOpenChange(false);
              } catch (saveError) {
                setError(
                  saveError instanceof Error ? saveError.message : t('error')
                );
              }
            }}
            type="button"
          >
            <KeyRound className="mr-2 h-4 w-4" />
            {t('save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
