'use client';

import { Check, Copy, Eye, EyeOff, Loader2, RefreshCw } from '@tuturuuu/icons';
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
import { generateSecureTemporaryPassword } from './password-generator';

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
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { copyToClipboard, isCopied } = useCopyToClipboard({ timeout: 2000 });

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
      setPasswordResetComplete(false);
      setShowPassword(false);
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
              <div className="space-y-2">
                <Label htmlFor="internal-account-new-password">
                  {t('dialog.new_password')}
                </Label>
                <div className="flex gap-2">
                  <div className="relative min-w-0 flex-1">
                    <Input
                      autoComplete="new-password"
                      className="pr-10 font-mono"
                      data-testid="internal-account-new-password"
                      id="internal-account-new-password"
                      minLength={MIN_PASSWORD_LENGTH}
                      onChange={(event) => setNewPassword(event.target.value)}
                      type={showPassword ? 'text' : 'password'}
                      value={newPassword}
                    />
                    <Button
                      aria-label={
                        showPassword
                          ? t('dialog.hide_password')
                          : t('dialog.show_password')
                      }
                      className="absolute top-1/2 right-1 size-8 -translate-y-1/2"
                      onClick={() => setShowPassword((value) => !value)}
                      size="icon"
                      type="button"
                      variant="ghost"
                    >
                      {showPassword ? (
                        <EyeOff className="size-4" />
                      ) : (
                        <Eye className="size-4" />
                      )}
                    </Button>
                  </div>
                  <Button
                    onClick={() => {
                      setNewPassword(generateSecureTemporaryPassword());
                      setShowPassword(true);
                    }}
                    type="button"
                    variant="outline"
                  >
                    <RefreshCw className="size-4" />
                    {t('dialog.generate_password')}
                  </Button>
                </div>
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
