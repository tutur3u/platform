import { NextIntlClientProvider } from 'next-intl';
import { getMessages } from 'next-intl/server';
import type React from 'react';
import '@tuturuuu/marketing-shell/fonts.css';
import { MarketingFrame } from '@/components/layouts/marketing-frame';
import { PrivacyConsent } from '@/components/privacy-consent';
import {
  getClientMessages,
  MARKETING_CLIENT_MESSAGE_NAMESPACES,
  ROOT_CLIENT_MESSAGE_PATHS,
} from '@/i18n/client-messages';
import { ScrollToTop } from './scroll-to-top';

interface LayoutProps {
  children: React.ReactNode;
}

// The provider sits above the navbar and footer as well as the page, so their
// client components translate during server rendering.
export default async function Layout({ children }: LayoutProps) {
  const messages = getClientMessages(await getMessages(), [
    ...ROOT_CLIENT_MESSAGE_PATHS,
    ...MARKETING_CLIENT_MESSAGE_NAMESPACES,
  ]);

  return (
    <NextIntlClientProvider messages={messages}>
      <ScrollToTop />
      <MarketingFrame>{children}</MarketingFrame>
      <PrivacyConsent />
    </NextIntlClientProvider>
  );
}
