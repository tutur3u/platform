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
import { useState } from 'react';

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

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      setName('');
      setValue('');
    } else {
      setName(state?.name ?? '');
    }
    onOpenChange(nextOpen);
  };

  if (!state) {
    return null;
  }

  const currentName = name || state.name;

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
              onChange={(event) => setName(event.target.value)}
              value={currentName}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="mobile-deployment-secret-value">{t('value')}</Label>
            <Input
              autoComplete="off"
              id="mobile-deployment-secret-value"
              onChange={(event) => setValue(event.target.value)}
              type="password"
              value={value}
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            disabled={!currentName.trim() || !value || pending}
            onClick={async () => {
              await onSave({
                name: currentName,
                previousName: state.previousName,
                value,
              });
              handleOpenChange(false);
            }}
          >
            <KeyRound className="mr-2 h-4 w-4" />
            {t('save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
