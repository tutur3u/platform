'use client';

import { AlertTriangle } from '@tuturuuu/icons/lucide-static';
import { Button } from '@tuturuuu/ui/button';
import { useTranslations } from 'next-intl';
import { ExpiredLinkIllustration } from './auth-illustrations';
import { ConfirmationCard } from './internal-app-account-confirmation-parts';

export type ReturnUrlFailureKind = 'invalid' | 'handoff' | 'refresh';

function decodeReturnUrl(returnUrl: string) {
  try {
    return decodeURIComponent(returnUrl);
  } catch {
    return returnUrl;
  }
}

function getReturnUrlDisplay(returnUrl: string) {
  const decodedUrl = decodeReturnUrl(returnUrl);

  try {
    return new URL(decodedUrl).origin;
  } catch {
    return decodedUrl.length > 120
      ? `${decodedUrl.slice(0, 117)}...`
      : decodedUrl;
  }
}

export function InvalidReturnUrlWarning({
  failure,
  onClear,
  returnUrl,
}: {
  failure: ReturnUrlFailureKind;
  onClear: () => void;
  returnUrl: string;
}) {
  const t = useTranslations();
  const returnUrlDisplay = getReturnUrlDisplay(returnUrl);
  const linkIsInvalid = failure === 'invalid';
  const description = {
    handoff: 'login.cross_app_handoff_session_failed',
    invalid: 'login.invalid_return_url_description',
    refresh: 'login.cross_app_handoff_refresh_failed',
  } as const;

  return (
    <ConfirmationCard>
      <ExpiredLinkIllustration />
      <div className="flex flex-col gap-1.5 text-center">
        <h2 className="text-balance font-extrabold text-2xl tracking-[-0.02em]">
          {t(
            linkIsInvalid
              ? 'login.invalid_return_url_title'
              : 'login.cross_app_handoff_error_title'
          )}
        </h2>
        <p className="text-balance text-muted-foreground text-sm">
          {t(description[failure])}
        </p>
      </div>

      <Button
        className="h-12 w-full rounded-2xl font-bold"
        onClick={linkIsInvalid ? onClear : () => window.location.reload()}
        type="button"
      >
        {t(
          linkIsInvalid
            ? 'login.clear_invalid_return_url'
            : 'login.cross_app_handoff_retry'
        )}
      </Button>

      <div
        className="flex items-start gap-3 rounded-2xl bg-dynamic-yellow/10 px-3.5 py-3 text-dynamic-yellow text-sm leading-relaxed"
        role="alert"
      >
        <AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0" />
        <div className="min-w-0 space-y-1">
          <p className="font-bold">{t('login.invalid_return_url_label')}</p>
          <p className="break-all font-mono text-foreground text-xs">
            {returnUrlDisplay}
          </p>
          {linkIsInvalid ? <p>{t('login.invalid_return_url_hint')}</p> : null}
        </div>
      </div>
    </ConfirmationCard>
  );
}
