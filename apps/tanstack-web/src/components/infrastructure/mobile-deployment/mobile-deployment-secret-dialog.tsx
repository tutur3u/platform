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
import { type FormEvent, useEffect, useState } from 'react';
import { MobileDeploymentFieldHelp } from './mobile-deployment-field-help';
import { MobileDeploymentSecretValueField } from './mobile-deployment-secret-value-field';

export interface SecretDialogState {
  currentValue?: string;
  description: string;
  name: string;
  nameEditable: boolean;
  options?: readonly string[];
  previousName?: string;
  secret?: boolean;
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
  const [showValue, setShowValue] = useState(false);

  const options = state?.options;
  const isSecret = state?.secret ?? true;

  useEffect(() => {
    if (!open || !state) {
      setName('');
      setValue('');
      setError(null);
      setShowValue(false);
      return;
    }

    setName(state.name ?? '');
    if (state.options?.length) {
      setValue(state.currentValue ?? state.options[0] ?? '');
    } else if (state.secret === false) {
      setValue(state.currentValue ?? '');
    } else {
      setValue('');
    }
    setError(null);
    setShowValue(state.secret === false);
  }, [open, state]);

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      setName('');
      setValue('');
      setError(null);
      setShowValue(false);
    }
    onOpenChange(nextOpen);
  };

  if (!state) {
    return null;
  }

  const currentName = name;
  const canSave = Boolean(currentName.trim() && value && !pending);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!canSave) {
      return;
    }

    try {
      await onSave({
        name: currentName,
        previousName: state.previousName,
        value,
      });
      handleOpenChange(false);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : t('error'));
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <form className="grid gap-4" onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{state.title}</DialogTitle>
            <DialogDescription>{state.description}</DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-2">
            <div className="space-y-2">
              <div className="flex items-center gap-1.5">
                <Label htmlFor="mobile-deployment-secret-name">
                  {t('name')}
                </Label>
                <MobileDeploymentFieldHelp field={currentName} />
              </div>
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
              <Label htmlFor="mobile-deployment-secret-value">
                {t('value')}
              </Label>
              <MobileDeploymentSecretValueField
                isSecret={isSecret}
                onShowValueChange={setShowValue}
                onValueChange={(next) => {
                  setError(null);
                  setValue(next);
                }}
                options={options}
                pending={pending}
                showValue={showValue}
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
            <Button disabled={!canSave} type="submit">
              <KeyRound className="mr-2 h-4 w-4" />
              {t('save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
