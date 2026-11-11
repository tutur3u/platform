import { MarketingShell } from '@tuturuuu/marketing-shell';
import { TUTURUUU_LOCAL_LOGO_URL } from '@tuturuuu/ui/custom/tuturuuu-logo';
import { getLocale, getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import { MarketingControls } from './marketing-controls';

export async function MarketingFrame({ children }: { children: ReactNode }) {
  const locale = (await getLocale()) === 'vi' ? 'vi' : 'en';
  const t = await getTranslations();
  return (
    <MarketingShell
      locale={locale}
      logoSrc={TUTURUUU_LOCAL_LOGO_URL}
      pathname=""
      brandHref="/"
      signInHref="/login"
      siteUrl=""
      t={(key) => t(key as never)}
      actions={<MarketingControls />}
    >
      {children}
    </MarketingShell>
  );
}
