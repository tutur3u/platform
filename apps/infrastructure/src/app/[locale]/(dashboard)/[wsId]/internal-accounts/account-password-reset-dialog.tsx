'use client';

import { Check, Copy, KeyRound, Loader2 } from '@tuturuuu/icons';
import { resetAccountPassword } from '@tuturuuu/internal-api/infrastructure';
import { Alert, AlertDescription, AlertTitle } from '@tuturuuu/ui/alert';
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
import { toast } from '@tuturuuu/ui/sonner';
import { Textarea } from '@tuturuuu/ui/textarea';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { TemporaryPasswordField } from './temporary-password-field';

const MIN_PASSWORD_LENGTH = 12;

interface Props {
  onOpenChange: (open: boolean) => void;
  open: boolean;
}

export function AccountPasswordResetDialog({ onOpenChange, open }: Props) {
  const t = useTranslations('internal-accounts');
  const [email, setEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [complete, setComplete] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { copyToClipboard, isCopied } = useCopyToClipboard({ timeout: 2000 });
  const normalizedEmail = email.trim().toLowerCase();
  const canSubmit =
    normalizedEmail.includes('@') &&
    newPassword.length >= MIN_PASSWORD_LENGTH &&
    !isSubmitting;

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) {
      setEmail('');
      setNewPassword('');
      setComplete(false);
    }
    onOpenChange(nextOpen);
  }

  async function submit() {
    if (!canSubmit) return;
    setIsSubmitting(true);
    try {
      await resetAccountPassword({
        action: 'reset_password',
        email: normalizedEmail,
        newPassword,
      });
      setComplete(true);
      toast.success(t('password_recovery.toast_success'));
    } catch {
      toast.error(t('password_recovery.toast_error'));
    } finally {
      setIsSubmitting(false);
    }
  }

  const handoffMessage = t('dialog.reset_password.handoff_message', {
    email: normalizedEmail,
    password: newPassword,
  });

  return (
    <Dialog onOpenChange={handleOpenChange} open={open}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('password_recovery.dialog_title')}</DialogTitle>
          <DialogDescription>
            {t('password_recovery.dialog_description')}
          </DialogDescription>
        </DialogHeader>

        {complete ? (
          <div className="space-y-4 py-2">
            <Alert>
              <Check className="size-4" />
              <AlertTitle>
                {t('dialog.reset_password.success_title')}
              </AlertTitle>
              <AlertDescription>
                {t('dialog.reset_password.success_description')}
              </AlertDescription>
            </Alert>
            <div className="space-y-2">
              <Label htmlFor="platform-account-handoff-message">
                {t('dialog.reset_password.handoff_label')}
              </Label>
              <Textarea
                className="min-h-28 resize-none font-mono text-sm"
                id="platform-account-handoff-message"
                readOnly
                value={handoffMessage}
              />
            </div>
          </div>
        ) : (
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="platform-account-email">
                {t('password_recovery.email_label')}
              </Label>
              <Input
                autoComplete="off"
                id="platform-account-email"
                onChange={(event) => setEmail(event.target.value)}
                placeholder={t('password_recovery.email_placeholder')}
                type="email"
                value={email}
              />
              <p className="text-muted-foreground text-xs">
                {t('password_recovery.email_help')}
              </p>
            </div>
            <TemporaryPasswordField
              id="platform-account-new-password"
              minLength={MIN_PASSWORD_LENGTH}
              onChange={setNewPassword}
              value={newPassword}
            />
          </div>
        )}

        <DialogFooter>
          {complete ? (
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
              <Button disabled={!canSubmit} onClick={submit} type="button">
                {isSubmitting ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <KeyRound className="size-4" />
                )}
                {t('password_recovery.confirm')}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
