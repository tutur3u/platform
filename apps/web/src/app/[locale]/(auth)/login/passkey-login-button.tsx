'use client';

import { Fingerprint } from '@tuturuuu/icons/lucide-static';
import { createAuthClient } from '@tuturuuu/supabase/next/auth-browser';
import { LoadingIndicator } from '@tuturuuu/ui/custom/loading-indicator';
import { useTranslations } from 'next-intl';
import { type ReactNode, useId, useState } from 'react';
import { authToast as toast } from './auth-inline-error-store';
import {
  appendDiagnosticReference,
  createClientAuthDiagnosticCode,
} from './auth-diagnostic-copy';
import { SocialLoginButton } from './social-login-button';

interface PasskeyLoginButtonProps {
  /** A right-edge mark such as the "Last used" chip. */
  badge?: ReactNode;
  captchaToken?: string;
  canRenderTurnstile?: boolean;
  disabled?: boolean;
  onAuthenticated: () => Promise<void>;
  onCaptchaReset?: () => void;
  requiresTurnstile?: boolean;
  /** The id of a security-check message rendered elsewhere on the page. */
  turnstileDescribedBy?: string;
  turnstileError?: string;
}

export function PasskeyLoginButton({
  badge,
  captchaToken,
  canRenderTurnstile = false,
  disabled,
  onAuthenticated,
  onCaptchaReset,
  requiresTurnstile = false,
  turnstileDescribedBy,
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
      <SocialLoginButton
        aria-describedby={
          turnstileBlockReason
            ? turnstileErrorId
            : isTurnstileBlocked
              ? turnstileDescribedBy
              : undefined
        }
        badge={badge}
        disabled={disabled || isAuthenticating || isTurnstileBlocked}
        icon={
          isAuthenticating ? (
            <LoadingIndicator className="size-5" />
          ) : (
            <Fingerprint aria-hidden className="size-5" />
          )
        }
        onClick={handlePasskeyLogin}
      >
        {t('continue_with_passkey')}
      </SocialLoginButton>
      {turnstileBlockReason ? (
        <p
          id={turnstileErrorId}
          className="text-balance text-center text-destructive text-sm"
        >
          {turnstileBlockReason}
        </p>
      ) : null}
    </div>
  );
}
