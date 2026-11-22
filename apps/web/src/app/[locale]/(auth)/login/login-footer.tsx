'use client';

import { useLocale, useTranslations } from 'next-intl';
import type { ReactNode } from 'react';

const LINK_CLASS =
  'rounded-sm font-semibold text-foreground underline decoration-input underline-offset-[3px] transition-colors hover:decoration-foreground focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2';

/** `/vi/terms` for Vietnamese, `/terms` for the default locale. */
export function localizedAuthPath(path: string, locale: string) {
  return locale === 'en' ? path : `/${locale}${path}`;
}

/**
 * Sign-in footer: the Terms and Privacy notice (sign-in carries no product
 * email consent; that is an onboarding opt-in, off by default) and the
 * account recovery link.
 */
export function LoginFooter() {
  const t = useTranslations('login');
  const locale = useLocale();
  const link = (path: string) => (chunks: ReactNode) => (
    <a className={LINK_CLASS} href={localizedAuthPath(path, locale)}>
      {chunks}
    </a>
  );

  return (
    <footer className="flex flex-col items-center gap-2 pt-3 text-center font-semibold text-muted-foreground text-xs leading-snug sm:flex-row sm:justify-between sm:text-left">
      <p className="text-balance">
        {t.rich('legal_notice', {
          privacy: link('/privacy'),
          terms: link('/terms'),
        })}
      </p>
      <a
        className={`${LINK_CLASS} shrink-0`}
        href={localizedAuthPath('/auth/recovery', locale)}
      >
        {t('trouble_signing_in')}
      </a>
    </footer>
  );
}
