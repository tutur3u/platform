'use client';

import { AtSign, Loader2 } from '@tuturuuu/icons';
import type {
  InternalAccount,
  UpdateInternalAccountPayload,
} from '@tuturuuu/internal-api/infrastructure';
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
import { WORKSPACE_HANDLE_REGEX } from '@tuturuuu/utils/workspace-handle';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

interface Props {
  account: InternalAccount;
  onConfirm: (payload: UpdateInternalAccountPayload) => Promise<unknown>;
  onOpenChange: (open: boolean) => void;
  open: boolean;
}

export function InternalAccountEditDialog({
  account,
  onConfirm,
  onOpenChange,
  open,
}: Props) {
  const t = useTranslations('internal-accounts');
  const [displayName, setDisplayName] = useState(
    account.displayName ?? account.email.split('@')[0] ?? ''
  );
  const [username, setUsername] = useState(account.username ?? '');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const normalizedUsername = username.trim().toLowerCase();
  const usernameIsValid =
    !normalizedUsername || WORKSPACE_HANDLE_REGEX.test(normalizedUsername);
  const canSubmit =
    Boolean(displayName.trim()) && usernameIsValid && !isSubmitting;

  async function submit() {
    if (!canSubmit) return;
    setIsSubmitting(true);
    try {
      await onConfirm({
        action: 'update_profile',
        displayName: displayName.trim(),
        username: normalizedUsername || null,
      });
      onOpenChange(false);
    } catch {
      // The mutation owns user-facing error reporting and keeps the dialog open.
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('profile.title')}</DialogTitle>
          <DialogDescription>
            {t('profile.description', { email: account.email })}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor={`display-name-${account.id}`}>
              {t('profile.display_name')}
            </Label>
            <Input
              autoComplete="name"
              id={`display-name-${account.id}`}
              maxLength={100}
              onChange={(event) => setDisplayName(event.target.value)}
              value={displayName}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor={`username-${account.id}`}>
              {t('profile.username')}
            </Label>
            <div className="relative">
              <AtSign className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                aria-invalid={!usernameIsValid}
                autoCapitalize="none"
                autoComplete="username"
                className="pl-9"
                id={`username-${account.id}`}
                maxLength={64}
                onChange={(event) => setUsername(event.target.value)}
                value={username}
              />
            </div>
            <p className="text-muted-foreground text-xs">
              {usernameIsValid
                ? t('profile.username_help')
                : t('profile.username_invalid')}
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button
            disabled={isSubmitting}
            onClick={() => onOpenChange(false)}
            type="button"
            variant="outline"
          >
            {t('actions.cancel')}
          </Button>
          <Button disabled={!canSubmit} onClick={submit} type="button">
            {isSubmitting ? <Loader2 className="size-4 animate-spin" /> : null}
            {t('profile.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
