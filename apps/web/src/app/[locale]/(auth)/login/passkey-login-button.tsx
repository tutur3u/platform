'use client';

import { Fingerprint } from '@tuturuuu/icons/lucide-static';
import { createAuthClient } from '@tuturuuu/supabase/next/auth-browser';
import { Button } from '@tuturuuu/ui/button';
import { LoadingIndicator } from '@tuturuuu/ui/custom/loading-indicator';
import { toast } from '@tuturuuu/ui/sonner';
import { useTranslations } from 'next-intl';
import { useId, useState } from 'react';
import {
  appendDiagnosticReference,
  createClientAuthDiagnosticCode,
} from './auth-diagnostic-copy';

interface PasskeyLoginButtonProps {
  captchaToken?: string;
  canRenderTurnstile?: boolean;
  disabled?: boolean;
  onAuthenticated: () => Promise<void>;
  onCaptchaReset?: () => void;
  requiresTurnstile?: boolean;
  turnstileError?: string;
}

export function PasskeyLoginButton({
  captchaToken,
  canRenderTurnstile = false,
  disabled,
  onAuthenticated,
  onCaptchaReset,
  requiresTurnstile = false,
  turnstileError,
}: PasskeyLoginButtonProps) {
  const t = useTranslations('login');
  const turnstileErrorId = useId();
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const isTurnstileBlocked =
    requiresTurnstile && (!canRenderTurnstile || !captchaToken);
  const turnstileBlockReason = isTurnstileBlocked ? turnstileError : undefined;

  const formatDiagnosticDescription = (
    description: string,
    diagnosticCode: string
  ) =>
    appendDiagnosticReference({
      description,
      diagnosticCode,
      referenceLabel: t('diagnostic_reference', { code: diagnosticCode }),
    });

  const handlePasskeyLogin = async () => {
    if (disabled || isAuthenticating || isTurnstileBlocked) {
      return;
    }

    if (
      typeof window.PublicKeyCredential === 'undefined' ||
      typeof navigator.credentials?.get !== 'function'
    ) {
      const diagnosticCode = createClientAuthDiagnosticCode('AUTH-PASSKEY');
      toast.error(t('passkey_failed'), {
        description: formatDiagnosticDescription(
          t('passkey_try_again'),
          diagnosticCode
        ),
      });
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
        const diagnosticCode = createClientAuthDiagnosticCode('AUTH-PASSKEY');
        toast.error(t('passkey_failed'), {
          description: formatDiagnosticDescription(
            t('passkey_try_again'),
            diagnosticCode
          ),
        });
        return;
      }

      await onAuthenticated();
    } catch {
      const diagnosticCode = createClientAuthDiagnosticCode('AUTH-PASSKEY');
      toast.error(t('passkey_failed'), {
        description: formatDiagnosticDescription(
          t('passkey_try_again'),
          diagnosticCode
        ),
      });
    } finally {
      if (requiresTurnstile) {
        onCaptchaReset?.();
      }
      setIsAuthenticating(false);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <Button
        type="button"
        variant="outline"
        className="h-12 w-full rounded-2xl font-medium"
        disabled={disabled || isAuthenticating || isTurnstileBlocked}
        onClick={handlePasskeyLogin}
        aria-describedby={turnstileBlockReason ? turnstileErrorId : undefined}
      >
        {isAuthenticating ? (
          <LoadingIndicator className="size-4" />
        ) : (
          <Fingerprint className="size-4" />
        )}
        <span>{t('continue_with_passkey')}</span>
      </Button>
      {turnstileBlockReason ? (
        <p id={turnstileErrorId} className="text-destructive text-sm">
          {turnstileBlockReason}
        </p>
      ) : null}
    </div>
  );
}
