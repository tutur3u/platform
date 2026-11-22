'use client';

import { History } from '@tuturuuu/icons/lucide-static';
import { useTranslations } from 'next-intl';
import type { LoginMethod } from './last-login-method';
import { OAuthMethodButtons } from './sign-in-methods';

/**
 * A rate-limited code or password attempt: an inline yellow alert that keeps
 * the existing copy and the existing suggestion to continue with a social
 * provider for the same email. The cooldown itself stays in the form.
 */
export function AuthRateLimitAlert({
  disabled,
  email,
  onChooseProvider,
  retryAfterSeconds,
}: {
  disabled: boolean;
  email: string;
  onChooseProvider: (method: LoginMethod) => void;
  /** The OTP cooldown, when the code step is the one rate limited. */
  retryAfterSeconds?: number;
}) {
  const t = useTranslations();

  return (
    <div className="flex flex-col gap-3">
      <div
        className="flex items-start gap-3 rounded-2xl bg-dynamic-yellow/10 px-3.5 py-3 text-dynamic-yellow text-sm leading-relaxed"
        role="alert"
      >
        <History aria-hidden className="mt-0.5 size-4 shrink-0" />
        <div className="min-w-0 space-y-1">
          <p className="font-bold">{t('login.rate_limited_title')}</p>
          {retryAfterSeconds ? (
            <p>
              {t('login.otp_rate_limited_inline', {
                seconds: retryAfterSeconds,
              })}
            </p>
          ) : null}
          <p>{t('login.rate_limited_social_auth_hint', { email })}</p>
        </div>
      </div>
      <OAuthMethodButtons disabled={disabled} onChoose={onChooseProvider} />
    </div>
  );
}
