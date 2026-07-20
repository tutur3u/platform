'use client';

import { Loader2 } from '@tuturuuu/icons';
import type {
  InternalAccount,
  InternalAccountAction,
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
import { useTranslations } from 'next-intl';
import { useState } from 'react';

const MIN_PASSWORD_LENGTH = 12;

interface InternalAccountActionDialogProps {
  account: InternalAccount;
  action: Exclude<InternalAccountAction, 'update_profile'> | null;
  onConfirm: (payload: UpdateInternalAccountPayload) => Promise<unknown>;
  onOpenChange: (open: boolean) => void;
  open: boolean;
}

export function InternalAccountActionDialog({
  account,
  action,
  onConfirm,
  onOpenChange,
  open,
}: InternalAccountActionDialogProps) {
  const t = useTranslations('internal-accounts');
  const [confirmationEmail, setConfirmationEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!action) return null;
  const selectedAction = action;

  const passwordIsValid =
    selectedAction !== 'reset_password' ||
    newPassword.length >= MIN_PASSWORD_LENGTH;
  const canSubmit =
    confirmationEmail.trim().toLowerCase() === account.email &&
    passwordIsValid &&
    !isSubmitting;

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) {
      setConfirmationEmail('');
      setNewPassword('');
    }
    onOpenChange(nextOpen);
  }

  async function submit() {
    if (!canSubmit) return;
    setIsSubmitting(true);

    try {
      await onConfirm(
        selectedAction === 'reset_password'
          ? {
              action: selectedAction,
              confirmationEmail,
              newPassword,
            }
          : { action: selectedAction, confirmationEmail }
      );
      handleOpenChange(false);
    } catch {
      // The mutation owns user-facing error reporting and keeps the dialog open.
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog onOpenChange={handleOpenChange} open={open}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t(`dialog.${selectedAction}.title`)}</DialogTitle>
          <DialogDescription>
            {t(`dialog.${selectedAction}.description`, {
              email: account.email,
            })}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {selectedAction === 'reset_password' ? (
            <div className="space-y-2">
              <Label htmlFor="internal-account-new-password">
                {t('dialog.new_password')}
              </Label>
              <Input
                autoComplete="new-password"
                data-testid="internal-account-new-password"
                id="internal-account-new-password"
                minLength={MIN_PASSWORD_LENGTH}
                onChange={(event) => setNewPassword(event.target.value)}
                type="password"
                value={newPassword}
              />
              <p className="text-muted-foreground text-xs">
                {t('dialog.password_help', { count: MIN_PASSWORD_LENGTH })}
              </p>
            </div>
          ) : null}

          <div className="space-y-2">
            <Label htmlFor="internal-account-confirmation-email">
              {t('dialog.confirmation_label')}
            </Label>
            <Input
              autoComplete="off"
              data-testid="internal-account-confirmation-email"
              id="internal-account-confirmation-email"
              onChange={(event) => setConfirmationEmail(event.target.value)}
              placeholder={account.email}
              value={confirmationEmail}
            />
            <p className="text-muted-foreground text-xs">
              {t('dialog.confirmation_help', { email: account.email })}
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button
            disabled={isSubmitting}
            onClick={() => handleOpenChange(false)}
            type="button"
            variant="outline"
          >
            {t('actions.cancel')}
          </Button>
          <Button
            data-testid="internal-account-confirm-action"
            disabled={!canSubmit}
            onClick={submit}
            type="button"
            variant={
              selectedAction === 'disable_access' ? 'destructive' : 'default'
            }
          >
            {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {t(`dialog.${selectedAction}.confirm`)}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
