'use client';

import { AlertTriangle, ArrowRight } from '@tuturuuu/icons/lucide-static';
import { Button } from '@tuturuuu/ui/button';
import { useTranslations } from 'next-intl';
import { ConfirmationCard } from './internal-app-account-confirmation-parts';

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
  onClear,
  returnUrl,
}: {
  onClear: () => void;
  returnUrl: string;
}) {
  const t = useTranslations();
  const returnUrlDisplay = getReturnUrlDisplay(returnUrl);

  return (
    <ConfirmationCard>
      <div className="space-y-4 text-center">
        <div className="mx-auto flex size-16 items-center justify-center rounded-full border border-dynamic-orange/20 bg-dynamic-orange/10 shadow-sm">
          <AlertTriangle className="size-6 text-dynamic-orange" />
        </div>
        <div className="space-y-2">
          <h2 className="font-semibold text-2xl">
            {t('login.invalid_return_url_title')}
          </h2>
          <p className="text-balance text-muted-foreground text-sm">
            {t('login.invalid_return_url_description')}
          </p>
        </div>
      </div>

      <div className="rounded-2xl border border-dynamic-orange/25 bg-dynamic-orange/10 p-4">
        <p className="font-medium text-dynamic-orange text-xs uppercase">
          {t('login.invalid_return_url_label')}
        </p>
        <p className="mt-1 break-all font-mono text-foreground text-xs">
          {returnUrlDisplay}
        </p>
      </div>

      <p className="text-balance text-muted-foreground text-sm">
        {t('login.invalid_return_url_hint')}
      </p>

      <Button
        className="group h-12 w-full rounded-2xl font-medium shadow-lg"
        onClick={onClear}
        type="button"
      >
        <span>{t('login.clear_invalid_return_url')}</span>
        <ArrowRight className="ml-2 size-4 transition-transform group-hover:translate-x-0.5" />
      </Button>
    </ConfirmationCard>
  );
}
