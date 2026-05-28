'use client';

import { Fingerprint } from '@tuturuuu/icons';
import { createAuthClient } from '@tuturuuu/supabase/next/auth-browser';
import { Button } from '@tuturuuu/ui/button';
import { LoadingIndicator } from '@tuturuuu/ui/custom/loading-indicator';
import { toast } from '@tuturuuu/ui/sonner';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

interface PasskeyLoginButtonProps {
  disabled?: boolean;
  onAuthenticated: () => Promise<void>;
}

export function PasskeyLoginButton({
  disabled,
  onAuthenticated,
}: PasskeyLoginButtonProps) {
  const t = useTranslations('login');
  const [isAuthenticating, setIsAuthenticating] = useState(false);

  const handlePasskeyLogin = async () => {
    if (disabled || isAuthenticating) {
      return;
    }

    setIsAuthenticating(true);

    try {
      const supabase = createAuthClient();
      const { error } = await supabase.auth.signInWithPasskey();

      if (error) {
        toast.error(t('passkey_failed'), {
          description: error.message,
        });
        return;
      }

      await onAuthenticated();
    } catch (error) {
      toast.error(t('passkey_failed'), {
        description:
          error instanceof Error ? error.message : t('passkey_try_again'),
      });
    } finally {
      setIsAuthenticating(false);
    }
  };

  return (
    <Button
      type="button"
      variant="outline"
      className="h-12 w-full rounded-2xl font-medium"
      disabled={disabled || isAuthenticating}
      onClick={handlePasskeyLogin}
    >
      {isAuthenticating ? (
        <LoadingIndicator className="size-4" />
      ) : (
        <Fingerprint className="size-4" />
      )}
      <span>{t('continue_with_passkey')}</span>
    </Button>
  );
}
