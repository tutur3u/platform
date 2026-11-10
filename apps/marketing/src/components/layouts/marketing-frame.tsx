'use client';

import {
  type MarketingLocale,
  MarketingShell,
  type ShellLink,
} from '@tuturuuu/marketing-shell';
import { persistLocalePreference } from '@tuturuuu/ui/custom/locale-preference';
import { TUTURUUU_LOCAL_LOGO_URL } from '@tuturuuu/ui/custom/tuturuuu-logo';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import type { ReactNode } from 'react';

const NextLink: ShellLink = ({ href, ...props }) => (
  <Link href={href} {...props} />
);

/**
 * Next adapter for the shared marketing layout (@tuturuuu/marketing-shell):
 * the same navbar, footer, fonts and frame as every Tuturuuu marketing page.
 */
export function MarketingFrame({ children }: { children: ReactNode }) {
  const t = useTranslations();
  const locale: MarketingLocale = useLocale() === 'vi' ? 'vi' : 'en';
  const pathname = usePathname();
  const router = useRouter();
  return (
    <MarketingShell
      LinkComponent={NextLink}
      locale={locale}
      logoSrc={TUTURUUU_LOCAL_LOGO_URL}
      onLocaleChange={(next) => {
        persistLocalePreference(next);
        router.refresh();
      }}
      pathname={pathname}
      signInHref="/login"
      siteUrl=""
      t={(key) => t(key as never)}
    >
      {children}
    </MarketingShell>
  );
}
