'use client';

import { Fingerprint } from '@tuturuuu/icons';
import { createAuthClient } from '@tuturuuu/supabase/next/auth-browser';
import { Button } from '@tuturuuu/ui/button';
import { LoadingIndicator } from '@tuturuuu/ui/custom/loading-indicator';
import { toast } from '@tuturuuu/ui/sonner';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

interface PasskeyLoginButtonProps {
  captchaToken?: string;
  canRenderTurnstile?: boolean;
  disabled?: boolean;
  onAuthenticated: () => Promise<void>;
  onCaptchaReset?: () => void;
  requiresTurnstile?: boolean;
}

export function PasskeyLoginButton({
  captchaToken,
  canRenderTurnstile = false,
  disabled,
  onAuthenticated,
  onCaptchaReset,
  requiresTurnstile = false,
}: PasskeyLoginButtonProps) {
  const t = useTranslations('login');
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const isTurnstileBlocked =
    requiresTurnstile && (!canRenderTurnstile || !captchaToken);

  const handlePasskeyLogin = async () => {
    if (disabled || isAuthenticating || isTurnstileBlocked) {
      return;
    }

    setIsAuthenticating(true);

    try {
      const supabase = createAuthClient();
      const { error } = captchaToken
        ? await supabase.auth.signInWithPasskey({
            options: {
              captchaToken,
            },
          })
        : await supabase.auth.signInWithPasskey();

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
      if (requiresTurnstile) {
        onCaptchaReset?.();
      }
      setIsAuthenticating(false);
    }
  };

  return (
    <Button
      type="button"
      variant="outline"
      className="h-12 w-full rounded-2xl font-medium"
      disabled={disabled || isAuthenticating || isTurnstileBlocked}
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
