'use client';

import { Eye, EyeOff, KeyRound } from '@tuturuuu/icons';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { useTranslations } from 'next-intl';
import { type FormEvent, useEffect, useState } from 'react';
import { MobileDeploymentFieldHelp } from './mobile-deployment-field-help';

export interface SecretDialogState {
  description: string;
  name: string;
  nameEditable: boolean;
  previousName?: string;
  title: string;
  /** Fixed-option set; when present the value is chosen from a dropdown. */
  options?: readonly string[];
  /** Stored plaintext value for non-secret fields, used to prefill. */
  currentValue?: string;
  /** Whether the value is sensitive (masked, never prefilled). Defaults true. */
  secret?: boolean;
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
    // Dropdowns default to the stored value or the first option; non-secret
    // text fields prefill the stored value; secrets always start empty.
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
              {options?.length ? (
                <Select
                  disabled={pending}
                  onValueChange={(next) => {
                    setError(null);
                    setValue(next);
                  }}
                  value={value}
                >
                  <SelectTrigger id="mobile-deployment-secret-value">
                    <SelectValue placeholder={t('selectValue')} />
                  </SelectTrigger>
                  <SelectContent>
                    {options.map((option) => (
                      <SelectItem key={option} value={option}>
                        {option}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <div className="relative">
                  <Input
                    autoComplete="off"
                    className="pr-10"
                    disabled={pending}
                    id="mobile-deployment-secret-value"
                    onChange={(event) => {
                      setError(null);
                      setValue(event.target.value);
                    }}
                    placeholder={t('secretValuePlaceholder')}
                    type={showValue || !isSecret ? 'text' : 'password'}
                    value={value}
                  />
                  <Button
                    aria-label={
                      showValue ? t('hideSecretValue') : t('showSecretValue')
                    }
                    aria-pressed={showValue}
                    className="absolute top-0 right-0 h-full px-3"
                    disabled={pending}
                    onClick={() => setShowValue((current) => !current)}
                    size="icon"
                    type="button"
                    variant="ghost"
                  >
                    {showValue ? (
                      <EyeOff className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <Eye className="h-4 w-4 text-muted-foreground" />
                    )}
                  </Button>
                </div>
              )}
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
