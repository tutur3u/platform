'use client';

import { Check, Copy, Loader2 } from '@tuturuuu/icons';
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
import { useCopyToClipboard } from '@tuturuuu/ui/hooks/use-copy-to-clipboard';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import { Textarea } from '@tuturuuu/ui/textarea';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { TemporaryPasswordField } from './temporary-password-field';

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
  const [passwordResetComplete, setPasswordResetComplete] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { copyToClipboard, isCopied } = useCopyToClipboard({ timeout: 2000 });

  if (!action) return null;
  const selectedAction = action;

  const passwordIsValid =
    selectedAction !== 'reset_password' ||
    (newPassword.length >= MIN_PASSWORD_LENGTH && newPassword.length <= 72);
  const canSubmit =
    confirmationEmail.trim().toLowerCase() === account.email &&
    passwordIsValid &&
    !isSubmitting;

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) {
      setConfirmationEmail('');
      setNewPassword('');
      setPasswordResetComplete(false);
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
      if (selectedAction === 'reset_password') {
        setPasswordResetComplete(true);
      } else {
        handleOpenChange(false);
      }
    } catch {
      // The mutation owns user-facing error reporting and keeps the dialog open.
    } finally {
      setIsSubmitting(false);
    }
  }

  const handoffMessage = t('dialog.reset_password.handoff_message', {
    email: account.email,
    password: newPassword,
  });

  return (
    <Dialog
      onOpenChange={(nextOpen) => {
        if (!isSubmitting) handleOpenChange(nextOpen);
      }}
      open={open}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t(`dialog.${selectedAction}.title`)}</DialogTitle>
          <DialogDescription>
            {t(`dialog.${selectedAction}.description`, {
              email: account.email,
            })}
          </DialogDescription>
        </DialogHeader>

        {passwordResetComplete ? (
          <div className="space-y-4 py-2">
            <div className="rounded-lg border bg-muted/40 p-4">
              <p className="font-medium text-sm">
                {t('dialog.reset_password.success_title')}
              </p>
              <p className="mt-1 text-muted-foreground text-sm">
                {t('dialog.reset_password.success_description')}
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="internal-account-handoff-message">
                {t('dialog.reset_password.handoff_label')}
              </Label>
              <Textarea
                className="min-h-28 resize-none font-mono text-sm"
                id="internal-account-handoff-message"
                readOnly
                value={handoffMessage}
              />
            </div>
          </div>
        ) : (
          <div className="space-y-4 py-2">
            {selectedAction === 'reset_password' ? (
              <TemporaryPasswordField
                id="internal-account-new-password"
                minLength={MIN_PASSWORD_LENGTH}
                onChange={setNewPassword}
                value={newPassword}
              />
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
        )}

        <DialogFooter>
          {passwordResetComplete ? (
            <>
              <Button
                onClick={() => void copyToClipboard(handoffMessage)}
                type="button"
                variant="outline"
              >
                {isCopied ? (
                  <Check className="size-4" />
                ) : (
                  <Copy className="size-4" />
                )}
                {isCopied
                  ? t('dialog.reset_password.copied')
                  : t('dialog.reset_password.copy_message')}
              </Button>
              <Button onClick={() => handleOpenChange(false)} type="button">
                {t('dialog.done')}
              </Button>
            </>
          ) : (
            <>
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
                  selectedAction === 'disable_access'
                    ? 'destructive'
                    : 'default'
                }
              >
                {isSubmitting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : null}
                {t(`dialog.${selectedAction}.confirm`)}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
