'use client';

import ReauthenticateForm, {
  type ReauthenticateFormData,
} from './reauthenticate-form';
import ResetPasswordForm, {
  type ResetPasswordFormData,
} from './reset-password-form';
import { createClient } from '@tuturuuu/supabase/next/client';
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

export default function ResetPasswordDialog() {
  const t = useTranslations();

  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [needsReauth, setNeedsReauth] = useState(false);
  const [passwordData, setPasswordData] =
    useState<ResetPasswordFormData | null>(null);

  const onSubmit = async (data: ResetPasswordFormData) => {
    setLoading(true);
    try {
      const supabase = createClient();

      const { error } = await supabase.auth.updateUser({
        password: data.password,
      });

      if (error) {
        // Check if reauthentication is needed
        if (
          error.message.includes('reauthentication_needed') ||
          error.message.includes('reauthentication') ||
          error.code === 'reauthentication_needed'
        ) {
          // Store password data and trigger reauthentication flow
          setPasswordData(data);

          // Send reauthentication OTP
          const { error: reauthError } = await supabase.auth.reauthenticate();

          if (reauthError) {
            throw reauthError;
          }

          setNeedsReauth(true);
          toast({
            title: 'Verification Required',
            description:
              "For security, we've sent a verification code to your email. Please enter it to continue.",
          });

          setLoading(false);
          return;
        }

        throw error;
      }

      toast({
        title: t('common.success'),
        description: 'Password has been updated successfully.',
      });

      // Close the dialog
      setOpen(false);
    } catch (error) {
      console.error('Error resetting password:', error);
      toast({
        title: t('common.error'),
        description:
          'An error occurred while resetting your password. Please try again later.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const onReauthSubmit = async (data: ReauthenticateFormData) => {
    if (!passwordData) return;

    setLoading(true);
    try {
      const supabase = createClient();

      const { error } = await supabase.auth.updateUser({
        password: passwordData.password,
        nonce: data.otp,
      });

      if (error) {
        throw error;
      }

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
    } finally {
      setLoading(false);
    }
  };

  const onResendReauth = async () => {
    try {
      const supabase = createClient();

      const { error } = await supabase.auth.reauthenticate();

      if (error) {
        throw error;
      }

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
