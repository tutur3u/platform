import { NextIntlClientProvider } from 'next-intl';
import { getMessages } from 'next-intl/server';
import type React from 'react';
import { MarketingFrame } from '@/components/layouts/marketing-frame';
import { getClientMessages } from '@/i18n/client-messages';
import { getMarketingMessagePaths } from '@/lib/marketing-render-context';
import { ScrollToTop } from './scroll-to-top';

interface LayoutProps {
  children: React.ReactNode;
}

// The provider sits above the navbar and footer as well as the page, so their
// client components translate during server rendering.
export default async function Layout({ children }: LayoutProps) {
  const messages = getClientMessages(
    await getMessages(),
    getMarketingMessagePaths()
  );

  const PrivacyConsent =
    process.env.NEXT_PUBLIC_COOKIE_CONSENT_BANNER === 'true'
      ? (await import('@/components/privacy-consent')).PrivacyConsent
      : null;
  return (
    <NextIntlClientProvider messages={messages}>
      <ScrollToTop />
      <MarketingFrame>{children}</MarketingFrame>
      {PrivacyConsent ? <PrivacyConsent /> : null}
    </NextIntlClientProvider>
  );
}
