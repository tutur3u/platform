import { cn } from '@tuturuuu/utils/format';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages } from 'next-intl/server';
import type React from 'react';
import Footer from '@/components/layouts/Footer';
import {
  getClientMessages,
  MARKETING_CLIENT_MESSAGE_NAMESPACES,
  ROOT_CLIENT_MESSAGE_NAMESPACES,
} from '@/i18n/client-messages';
import MarketingNavbar from '../marketing-navbar';
import { marketingFontVariables } from './marketing-fonts';
import { ScrollToTop } from './scroll-to-top';

interface LayoutProps {
  children: React.ReactNode;
}

// The provider sits above the navbar and footer as well as the page, so their
// client components translate during server rendering.
export default async function Layout({ children }: LayoutProps) {
  const messages = getClientMessages(await getMessages(), [
    ...ROOT_CLIENT_MESSAGE_NAMESPACES,
    ...MARKETING_CLIENT_MESSAGE_NAMESPACES,
  ]);

  return (
    <NextIntlClientProvider messages={messages}>
      {/* Display + mono faces are scoped to marketing so product surfaces keep
          the app font untouched. */}
      <div className={cn('contents', marketingFontVariables)}>
        <ScrollToTop />
        <MarketingNavbar />
        {/* pt clears the floating pill navbar (top offset + 3.5rem bar) */}
        <div className="flex flex-col overflow-x-clip pt-20" id="main-content">
          {children}
        </div>
        <Footer />
      </div>
    </NextIntlClientProvider>
  );
}
