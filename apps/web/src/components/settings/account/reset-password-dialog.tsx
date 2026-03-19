'use client';

import { useMutation } from '@tanstack/react-query';
import { Button } from '@tuturuuu/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@tuturuuu/ui/dialog';
import { toast } from '@tuturuuu/ui/hooks/use-toast';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { DEV_MODE, PORT } from '@/constants/common';
import { apiFetch, HttpError } from '@/lib/api-fetch';
import ReauthenticateForm, {
  type ReauthenticateFormData,
} from './reauthenticate-form';
import ResetPasswordForm, {
  type ResetPasswordFormData,
} from './reset-password-form';

export default function ResetPasswordDialog() {
  const t = useTranslations();

  const [open, setOpen] = useState(false);
  const [needsReauth, setNeedsReauth] = useState(false);
  const [passwordData, setPasswordData] =
    useState<ResetPasswordFormData | null>(null);

  const updatePasswordMutation = useMutation({
    mutationFn: (payload: { password: string; nonce?: string }) =>
      apiFetch('/api/v1/users/me/password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }),
  });

  const resendReauthMutation = useMutation({
    mutationFn: () =>
      apiFetch('/api/v1/users/me/password/reauth', {
        method: 'POST',
      }),
  });

  const loading =
    updatePasswordMutation.isPending || resendReauthMutation.isPending;

  const onSubmit = async (data: ResetPasswordFormData) => {
    try {
      await updatePasswordMutation.mutateAsync({ password: data.password });

      toast({
        title: t('common.success'),
        description: 'Password has been updated successfully.',
      });

      // Close the dialog
      setOpen(false);
    } catch (error) {
      if (error instanceof HttpError && error.status === 409) {
        setPasswordData(data);
        await resendReauthMutation.mutateAsync();
        setNeedsReauth(true);

        if (DEV_MODE) {
          window.open(
            window.location.origin.replace(PORT.toString(), '8004'),
            '_blank'
          );
        }

        toast({
          title: 'Verification Required',
          description:
            "For security, we've sent a verification code to your email. Please enter it to continue.",
        });
        return;
      }

      console.error('Error resetting password:', error);
      toast({
        title: t('common.error'),
        description:
          'An error occurred while resetting your password. Please try again later.',
        variant: 'destructive',
      });
    }
  };

  const onReauthSubmit = async (data: ReauthenticateFormData) => {
    if (!passwordData) return;

    try {
      await updatePasswordMutation.mutateAsync({
        password: passwordData.password,
        nonce: data.otp,
      });

      toast({
        title: t('common.success'),
        description: 'Password has been updated successfully.',
      });

      // Reset state and close the dialog
      setNeedsReauth(false);
      setPasswordData(null);
      setOpen(false);
    } catch (error) {
      console.error('Error updating password with nonce:', error);
      toast({
        title: t('common.error'),
        description:
          'Invalid verification code or an error occurred. Please try again.',
        variant: 'destructive',
      });
    }
  };

  const onResendReauth = async () => {
    try {
      await resendReauthMutation.mutateAsync();

      toast({
        title: t('common.success'),
        description: 'Verification code has been resent to your email.',
      });
    } catch (error) {
      console.error('Error resending reauthentication code:', error);
      toast({
        title: t('common.error'),
        description: 'Failed to resend verification code. Please try again.',
        variant: 'destructive',
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="w-full">
          {t('settings-account.reset-password')}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {needsReauth
              ? 'Verify Your Identity'
              : t('reset-password.reset-password')}
          </DialogTitle>
        </DialogHeader>

        {needsReauth ? (
          <ReauthenticateForm
            onSubmit={onReauthSubmit}
            onResend={onResendReauth}
            loading={loading}
          />
        ) : (
          <ResetPasswordForm onSubmit={onSubmit} loading={loading} />
        )}
      </DialogContent>
    </Dialog>
  );
}
