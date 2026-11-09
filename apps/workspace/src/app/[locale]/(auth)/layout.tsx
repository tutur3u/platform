import { NO_INDEX_ROBOTS } from '@tuturuuu/utils/common/metadata';
import type { Metadata } from 'next';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages } from 'next-intl/server';
import type { ReactNode } from 'react';
import {
  AUTH_CLIENT_MESSAGE_NAMESPACES,
  getClientMessages,
} from '@/i18n/client-messages';

export const metadata: Metadata = {
  robots: NO_INDEX_ROBOTS,
};

export default async function AuthLayout({
  children,
}: {
  children: ReactNode;
}) {
  const messages = getClientMessages(
    await getMessages(),
    AUTH_CLIENT_MESSAGE_NAMESPACES
  );

  return (
    <NextIntlClientProvider messages={messages}>
      {children}
    </NextIntlClientProvider>
  );
}
